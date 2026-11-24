import { prisma } from "@/lib/db/db";
import { logServerError } from "@/lib/infra/server-public-error";
import { toDbSellerId } from "@/lib/mercadolibre/seller-id";
import { linkNewSellerListings } from "@/lib/stock/stock-positions";

/**
 * Mantém em dia o vínculo que as opções de venda precisam (`listing-groups.ts`):
 * o UP de cada anúncio em `Listing` e o item de estoque por UP. Roda para
 * toda organização, com ou sem o Estoque ativado — criar `StockItem` não
 * mexe no livro de estoque (sem saldo, lote ou movimentação até a ativação).
 */

/** Intervalo mínimo entre duas rodadas de vínculo por seller. */
export const LISTINGS_LINK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Rodada de vínculo em segundo plano (`StockBackgroundSync`), no máximo a
 * cada `LISTINGS_LINK_INTERVAL_MS` por seller. A reserva é atômica: duas abas
 * ao mesmo tempo não leem o ML duas vezes. Nunca lança — falha só adia.
 */
export async function maybeLinkListingGroups(input: {
  organizationId: string;
  mlUserId: number;
  accessToken: string;
  now?: Date;
}): Promise<{ ran: boolean; linked: number }> {
  const { organizationId, mlUserId, accessToken } = input;
  const now = input.now ?? new Date();
  const key = { organizationId, mlUserId: toDbSellerId(mlUserId) };
  const staleBefore = new Date(now.getTime() - LISTINGS_LINK_INTERVAL_MS);

  try {
    const previous = await prisma.organizationMlSeller.findUnique({
      where: { organizationId_mlUserId: key },
      select: { lastListingsLinkedAt: true },
    });
    if (!previous) return { ran: false, linked: 0 };
    if (previous.lastListingsLinkedAt && previous.lastListingsLinkedAt > staleBefore) {
      return { ran: false, linked: 0 };
    }
    const claimed = await prisma.organizationMlSeller.updateMany({
      where: {
        ...key,
        OR: [{ lastListingsLinkedAt: null }, { lastListingsLinkedAt: { lt: staleBefore } }],
      },
      data: { lastListingsLinkedAt: now },
    });
    if (claimed.count === 0) return { ran: false, linked: 0 };

    try {
      const linked = await linkNewSellerListings({ organizationId, mlUserId, accessToken });
      return { ran: true, linked };
    } catch (e) {
      // Devolve a vez: a próxima rodada do segundo plano tenta de novo.
      await prisma.organizationMlSeller.updateMany({
        where: { ...key, lastListingsLinkedAt: now },
        data: { lastListingsLinkedAt: previous.lastListingsLinkedAt },
      });
      throw e;
    }
  } catch (e) {
    logServerError("listing-groups-sync maybeLinkListingGroups", e);
    return { ran: false, linked: 0 };
  }
}
