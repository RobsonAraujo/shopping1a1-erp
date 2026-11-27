import { prisma } from "@/lib/db/db";
import { fetchAllUserItemIds, fetchItemsByIdsBatched } from "@/lib/mercadolibre/api";
import { toDbSellerId } from "@/lib/mercadolibre/seller-id";
import { ensureStockItemsForItems } from "@/lib/stock/stock-items";
import { insertMovements, LEDGER_TX_OPTIONS, lockOrganizationLedger } from "@/lib/stock/stock-ledger";
import { openingOwnFor } from "@/lib/stock/stock-opening";
import { refreshStockPositions, type PositionsProgress } from "@/lib/stock/stock-positions";

/**
 * Ativação do estoque automático, por organização. Não tem tela nem
 * perguntas: roda sozinha na primeira visita ao Estoque (`autoActivateStock`).
 *
 * 1. **Preparar** (demorado, lê o ML): cria os itens de estoque a partir dos
 *    anúncios (1 por UP) e lê o depósito e o Full de cada um.
 * 2. **Ativar** (uma transação): grava o saldo inicial Em casa de cada item
 *    (`openingOwnFor`: galpão digitado ou depósito do ML, o maior), o lote de
 *    abertura ao custo atual do cadastro e a data de ativação. Vendas
 *    anteriores a ela não contam: já estão no saldo inicial. O primeiro
 *    inventário confirma os números.
 */

export class StockAlreadyActivatedError extends Error {
  constructor() {
    super("stock_already_activated");
  }
}

export type StockActivationProgress =
  | { phase: "listings" }
  | ({ phase: "positions" } & PositionsProgress)
  | { phase: "saving" };

/** Resultado para a tela. `alreadyActive`: outra aba ou pessoa ativou antes (também é sucesso). */
export type StockActivationResult = { alreadyActive: boolean; items: number };

type Prepared = { sellerNodeIds: string[]; positionsComplete: boolean };

export async function autoActivateStock(input: {
  organizationId: string;
  mlUserId: number;
  accessToken: string;
  signal?: AbortSignal;
  onProgress?: (progress: StockActivationProgress) => void;
}): Promise<{ activatedAt: Date; items: number }> {
  const prepared = await prepareStockActivation(input);
  // "Parar" durante a leitura: não ativa (os itens criados ficam para a próxima vez).
  if (input.signal?.aborted) throw new Error("stock_activation_aborted");
  input.onProgress?.({ phase: "saving" });
  return activateStock({ organizationId: input.organizationId, mlUserId: input.mlUserId, prepared });
}

async function prepareStockActivation(input: {
  organizationId: string;
  mlUserId: number;
  accessToken: string;
  signal?: AbortSignal;
  onProgress?: (progress: StockActivationProgress) => void;
}): Promise<Prepared> {
  const { organizationId, mlUserId, accessToken, signal } = input;
  if (await prisma.stockSettings.findUnique({ where: { organizationId } })) {
    throw new StockAlreadyActivatedError();
  }
  input.onProgress?.({ phase: "listings" });
  const [active, paused, products, kits] = await Promise.all([
    fetchAllUserItemIds(accessToken, mlUserId, { status: "active" }),
    fetchAllUserItemIds(accessToken, mlUserId, { status: "paused" }),
    prisma.product.findMany({ where: { organizationId }, select: { mlItemId: true } }),
    prisma.kit.findMany({ where: { organizationId }, select: { mlItemId: true } }),
  ]);
  const ids = [
    ...new Set([...active, ...paused, ...products.map((p) => p.mlItemId), ...kits.map((k) => k.mlItemId)]),
  ];
  const items = await fetchItemsByIdsBatched(accessToken, ids);
  await ensureStockItemsForItems(organizationId, items);

  const positions = await refreshStockPositions({
    organizationId,
    accessToken,
    stockItemIds: null,
    signal,
    onProgress: (p) => input.onProgress?.({ phase: "positions", ...p }),
  });
  return { sellerNodeIds: positions.sellerNodeIds, positionsComplete: positions.failed === 0 };
}

async function activateStock(input: {
  organizationId: string;
  mlUserId: number;
  prepared: Prepared;
}): Promise<{ activatedAt: Date; items: number }> {
  const { organizationId, mlUserId, prepared } = input;

  const stockItems = await prisma.stockItem.findMany({
    where: { organizationId },
    select: {
      id: true,
      primaryMlItemId: true,
      listings: { select: { mlItemId: true } },
      mlPosition: { select: { depositQty: true, fullTotalQty: true, error: true } },
    },
  });
  const mlItemIds = stockItems.flatMap((s) => s.listings.map((l) => l.mlItemId));
  const [warehouse, products, sellers] = await Promise.all([
    prisma.warehouseStock.findMany({
      where: { organizationId, mlItemId: { in: mlItemIds } },
      select: { mlItemId: true, quantity: true },
    }),
    prisma.product.findMany({ where: { organizationId, mlItemId: { in: mlItemIds } } }),
    prisma.organizationMlSeller.findMany({ where: { organizationId }, select: { mlUserId: true } }),
  ]);
  const warehouseByMlb = new Map(warehouse.map((w) => [w.mlItemId, w.quantity]));
  const productByMlb = new Map(products.map((p) => [p.mlItemId, p]));

  const openings = stockItems.map((s) => {
    const typed = s.listings.map((l) => warehouseByMlb.get(l.mlItemId) ?? 0);
    const pos = s.mlPosition && !s.mlPosition.error ? s.mlPosition : null;
    const opening = openingOwnFor({
      legacyWarehouse: typed.reduce((a, b) => a + b, 0),
      legacyWarehouseListings: typed.filter((q) => q > 0).length,
      depositQty: pos?.depositQty ?? null,
    });
    const product =
      (s.primaryMlItemId ? productByMlb.get(s.primaryMlItemId) : undefined) ??
      s.listings.map((l) => productByMlb.get(l.mlItemId)).find(Boolean);
    return { stockItemId: s.id, ...opening, fullTotal: pos?.fullTotalQty ?? 0, product };
  });

  const activatedAt = new Date();
  const activatingSeller = toDbSellerId(mlUserId);
  return prisma.$transaction(
    async (tx) => {
      await lockOrganizationLedger(tx, organizationId);
      if (await tx.stockSettings.findUnique({ where: { organizationId } })) {
        throw new StockAlreadyActivatedError();
      }

      // Saldo zero não vira movimentação (`insertMovements` ignora).
      await insertMovements(
        tx,
        organizationId,
        openings.map(({ stockItemId, own, note }) => ({
          stockItemId,
          type: "opening" as const,
          location: "own" as const,
          quantity: own,
          occurredAt: activatedAt,
          sourceType: "activation" as const,
          sourceId: "activation",
          reason: "Saldo inicial da ativação",
          // Fica no extrato do produto: diz de onde veio o número.
          note,
          createdByMlUserId: activatingSeller,
        })),
      );

      for (const { stockItemId, own, fullTotal, product } of openings) {
        await tx.stockLot.create({
          data: {
            organizationId,
            stockItemId,
            entryId: null,
            receivedAt: activatedAt,
            quantity: own + fullTotal,
            status: "active",
            activatedAt,
            costKnown: product != null && !product.needsCostReview,
            unitCostNf: product?.unitCostNf ?? 0,
            purchaseIcmsPercent: product?.purchaseIcmsPercent ?? 0,
            hasIcmsSt: product?.hasIcmsSt ?? false,
            purchaseCostWithSt: product?.purchaseCostWithSt ?? null,
            ipiPercent: product?.ipiPercent ?? 0,
            extraCosts: product?.extraCosts ?? 0,
          },
        });
      }

      await tx.stockSettings.create({
        data: {
          organizationId,
          activatedAt,
          activatedByMlUserId: activatingSeller,
          // O saldo inicial tratou o galpão digitado como "já inclui o depósito" (com o depósito de piso).
          legacyWarehouseIncludesMl: true,
        },
      });
      // Quem ativou acabou de ler tudo: a sincronização em segundo plano já
      // começa "fresca" (não relê o ML logo em seguida). Os outros sellers da
      // organização leem na primeira vez que usarem o ERP.
      for (const seller of sellers) {
        const isActivating = seller.mlUserId === activatingSeller;
        const data = {
          ordersCursor: activatedAt,
          lastOrdersSyncAt: isActivating ? activatedAt : null,
          lastPositionsSyncAt: isActivating && prepared.positionsComplete ? activatedAt : null,
          sellerNodeIds: isActivating ? prepared.sellerNodeIds : [],
        };
        await tx.stockSyncState.upsert({
          where: { organizationId_mlUserId: { organizationId, mlUserId: seller.mlUserId } },
          create: { organizationId, mlUserId: seller.mlUserId, ...data },
          update: data,
        });
      }
      return { activatedAt, items: openings.length };
    },
    LEDGER_TX_OPTIONS,
  );
}
