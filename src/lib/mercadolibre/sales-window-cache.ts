import { prisma } from "@/lib/db/db";
import {
  fetchSalesWindowForItemsInWindowBatched,
  type SalesWindowDateField,
  type SalesWindowItemResult,
} from "@/lib/mercadolibre/api";
import { mapWithConcurrency } from "@/lib/mercadolibre/concurrency";
import { logServerError } from "@/lib/infra/server-public-error";

/**
 * TTL curto de propósito — a janela de vendas é rolante (sempre termina
 * "agora", não um mês fechado), então o cache não pode viver muito sem
 * divergir da realidade. 20min é suficiente pra cobrir "abrir Estoque,
 * depois Compras, depois Operações Full na mesma sessão" sem repetir a
 * varredura de vendas por item no Mercado Livre a cada uma dessas telas.
 */
const SALES_WINDOW_CACHE_TTL_MS = 20 * 60 * 1000;

const WRITE_CONCURRENCY = 10;

function unitsOnly(
  details: Record<string, SalesWindowItemResult>,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(details).map(([itemId, result]) => [itemId, result.unitsSold]),
  );
}

/**
 * Só a leitura do cache (`SalesWindowSnapshot`), sem buscar ao vivo o que
 * faltar. Linha antiga com venda e sem `lastSaleAt` conta como miss (a
 * coluna veio depois): força uma varredura só daquele anúncio.
 */
export async function readCachedSalesWindowForItemsInWindow(
  organizationId: string,
  itemIds: string[],
  windowDays: number,
  dateField: SalesWindowDateField,
): Promise<Record<string, SalesWindowItemResult>> {
  const uniqueIds = [...new Set(itemIds.filter(Boolean))];
  if (uniqueIds.length === 0 || windowDays <= 0) return {};

  const cutoff = new Date(Date.now() - SALES_WINDOW_CACHE_TTL_MS);
  const cached = await prisma.salesWindowSnapshot.findMany({
    where: {
      organizationId,
      mlItemId: { in: uniqueIds },
      windowDays,
      dateField,
      computedAt: { gte: cutoff },
    },
    select: { mlItemId: true, unitsSold: true, lastSaleAt: true },
  });

  const result: Record<string, SalesWindowItemResult> = {};
  for (const row of cached) {
    // Retrato pré-coluna: vendeu e não tem data → miss.
    if (row.unitsSold > 0 && row.lastSaleAt === null) continue;
    result[row.mlItemId] = {
      unitsSold: row.unitsSold,
      lastSaleAt: row.lastSaleAt,
    };
  }
  return result;
}

/**
 * Só a leitura do cache (`SalesWindowSnapshot`), sem buscar ao vivo o que
 * faltar — usada pelo render rápido inicial dos kanbans (Compras/Operações
 * Full), que não pode esperar a varredura ML pra pintar a tela. Itens fora
 * do retorno simplesmente não estavam em cache (ou o snapshot expirou).
 */
export async function readCachedUnitsSoldForItemsInWindow(
  organizationId: string,
  itemIds: string[],
  windowDays: number,
  dateField: SalesWindowDateField,
): Promise<Record<string, number>> {
  return unitsOnly(
    await readCachedSalesWindowForItemsInWindow(
      organizationId,
      itemIds,
      windowDays,
      dateField,
    ),
  );
}

/**
 * Mesmo contrato de `fetchSalesWindowForItemsInWindowBatched`, com cache em
 * banco (TTL curto). Itens fora do cache (ou com snapshot expirado / sem
 * `lastSaleAt` quando havia venda) são buscados ao vivo.
 */
export async function fetchSalesWindowForItemsInWindowCached(
  organizationId: string,
  accessToken: string,
  sellerId: number,
  itemIds: string[],
  windowDays: number,
  dateField: SalesWindowDateField,
  /** Chamado só pros itens que precisaram de busca ao vivo (cache miss). */
  onItem?: (itemId: string, result: SalesWindowItemResult) => void,
): Promise<Record<string, SalesWindowItemResult>> {
  const uniqueIds = [...new Set(itemIds.filter(Boolean))];
  if (uniqueIds.length === 0 || windowDays <= 0) return {};

  const result = await readCachedSalesWindowForItemsInWindow(
    organizationId,
    uniqueIds,
    windowDays,
    dateField,
  );

  const missingIds = uniqueIds.filter((id) => !(id in result));
  if (missingIds.length === 0) return result;

  const fresh = await fetchSalesWindowForItemsInWindowBatched(
    accessToken,
    sellerId,
    missingIds,
    windowDays,
    dateField,
    undefined,
    onItem,
  );
  Object.assign(result, fresh);

  const computedAt = new Date();
  void mapWithConcurrency(
    Object.entries(fresh),
    WRITE_CONCURRENCY,
    ([mlItemId, { unitsSold, lastSaleAt }]) =>
      prisma.salesWindowSnapshot.upsert({
        where: {
          organizationId_mlItemId_windowDays_dateField: {
            organizationId,
            mlItemId,
            windowDays,
            dateField,
          },
        },
        create: {
          organizationId,
          mlItemId,
          windowDays,
          dateField,
          unitsSold,
          lastSaleAt,
          computedAt,
        },
        update: { unitsSold, lastSaleAt, computedAt },
      }),
  ).catch((e: unknown) => {
    logServerError("sales-window-cache write", e);
  });

  return result;
}

/**
 * Mesmo contrato de `fetchUnitsSoldForItemsInWindowBatched`, mas com um
 * cache em banco (TTL curto) na frente — evita repetir a mesma varredura
 * ML "unidades vendidas por item" entre Estoque, Compras e Operações Full
 * quando essas telas são abertas na mesma sessão. Itens fora do cache (ou
 * com snapshot expirado) são buscados ao vivo e o resultado é gravado pra
 * a próxima leitura.
 */
export async function fetchUnitsSoldForItemsInWindowCached(
  organizationId: string,
  accessToken: string,
  sellerId: number,
  itemIds: string[],
  windowDays: number,
  dateField: SalesWindowDateField,
  /** Chamado só pros itens que precisaram de busca ao vivo (cache miss) —
   * quem já veio do cache não dispara, o chamador já tinha esse valor
   * disponível antes desta chamada começar. */
  onItem?: (itemId: string, unitsSold: number) => void,
): Promise<Record<string, number>> {
  const details = await fetchSalesWindowForItemsInWindowCached(
    organizationId,
    accessToken,
    sellerId,
    itemIds,
    windowDays,
    dateField,
    onItem
      ? (itemId, result) => onItem(itemId, result.unitsSold)
      : undefined,
  );
  return unitsOnly(details);
}
