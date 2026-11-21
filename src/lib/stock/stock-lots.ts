import type { StockLot, StockMovementType } from "@/generated/prisma";
import { prisma } from "@/lib/db/db";
import { levelingScope } from "@/lib/dre/dre-product-cost-leveling-shared";
import { normalizeProductSku } from "@/lib/pricing/product-pricing";
import { zonedYmd } from "@/lib/report-timezone";
import { reportsConfig } from "@/config/reports";

/**
 * Custo por lote (PEPS: o primeiro que entra é o primeiro que sai).
 *
 * - Toda saída de propriedade (venda de casa ou do Full, saída manual, ajuste
 *   ou inventário para menos) consome o lote mais antigo. Mudar de lugar
 *   (envio ao Full, retirada) não consome nada.
 * - Estorno de venda volta para o lote de onde a venda saiu, se ele ainda
 *   estiver aberto; senão vai para o lote vigente. Assim o custo nunca "volta"
 *   para o anterior. Devolução e ajuste para mais vão para o lote vigente.
 * - Quando o lote vigente zera, o próximo da fila passa a valer. Os cadastros
 *   (`Product`) das opções de venda do item recebem o custo novo
 *   (Lucratividade, Central e Calculadora pegam sozinhos), e o período em que
 *   o custo antigo valeu vira um nivelamento do DRE (DRE e Tributário
 *   continuam certos sem mudar nada neles). O nivelamento segue a mesma regra
 *   do cadastro: começa no dia seguinte ao último nivelamento do produto (ou
 *   na criação do produto) e vai até a véspera da troca.
 *
 * Roda dentro da transação do livro (`insertMovements`), com o livro travado.
 */

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export type AllocatableMovement = {
  id: string;
  stockItemId: string;
  type: StockMovementType;
  quantity: number;
  occurredAt: Date;
};

const CONSUMING_TYPES = new Set<StockMovementType>(["sale", "manual_out"]);
const SIGNED_TYPES = new Set<StockMovementType>(["adjustment", "inventory_count"]);
const RETURNING_TYPES = new Set<StockMovementType>(["sale_reversal", "return_in"]);

/** Unidades que a movimentação tira (+) ou devolve (−) dos lotes; 0 = não mexe. */
export function lotEffect(movement: Pick<AllocatableMovement, "type" | "quantity">): number {
  if (CONSUMING_TYPES.has(movement.type)) return -movement.quantity;
  if (RETURNING_TYPES.has(movement.type)) return -movement.quantity;
  if (SIGNED_TYPES.has(movement.type)) return -movement.quantity;
  return 0;
}

export type LotState = Pick<StockLot, "id" | "status" | "quantity" | "consumedQty" | "receivedAt" | "createdAt">;

export type LotPlanStep = { lotId: string; quantity: number };

/**
 * Plano puro de consumo PEPS: de quais lotes sai cada unidade, quais lotes
 * esgotam e qual passa a ser o vigente. `lots` são os lotes abertos (vigente +
 * fila), em qualquer ordem.
 *
 * O vigente depois do consumo é o primeiro lote com saldo. Se tudo zerou
 * (estoque zerado ou negativo), o último lote continua vigente como
 * referência de custo — ninguém fica "sem custo" — e os anteriores esgotam.
 * Unidades além do que existe ficam em `unallocated` (estoque negativo; o
 * inventário corrige).
 */
export function planConsumption(
  lots: LotState[],
  units: number,
): { steps: LotPlanStep[]; depleted: string[]; currentLotId: string | null; unallocated: number } {
  const ordered = [...lots].sort(
    (a, b) =>
      (a.status === "active" ? 0 : 1) - (b.status === "active" ? 0 : 1) ||
      a.receivedAt.getTime() - b.receivedAt.getTime() ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  );
  const left = new Map(ordered.map((l) => [l.id, l.quantity - l.consumedQty]));
  const steps: LotPlanStep[] = [];
  let remaining = units;
  for (const lot of ordered) {
    if (remaining <= 0) break;
    const available = left.get(lot.id) ?? 0;
    if (available <= 0) continue;
    const take = Math.min(available, remaining);
    steps.push({ lotId: lot.id, quantity: take });
    left.set(lot.id, available - take);
    remaining -= take;
  }
  const current = ordered.find((l) => (left.get(l.id) ?? 0) > 0) ?? ordered[ordered.length - 1] ?? null;
  const depleted: string[] = [];
  if (current) {
    for (const lot of ordered) {
      if (lot.id === current.id) break;
      depleted.push(lot.id);
    }
  }
  return { steps, depleted, currentLotId: current?.id ?? null, unallocated: remaining };
}

type LotSwitch = { stockItemId: string; fromLotId: string; toLotId: string; at: Date };

async function openLots(tx: Tx, organizationId: string, stockItemId: string) {
  return tx.stockLot.findMany({
    where: {
      organizationId,
      stockItemId,
      status: { in: ["active", "queued"] },
      OR: [{ entryId: null }, { entry: { status: "active" } }],
    },
  });
}

async function consume(
  tx: Tx,
  organizationId: string,
  movement: AllocatableMovement,
  units: number,
  switches: LotSwitch[],
) {
  const lots = await openLots(tx, organizationId, movement.stockItemId);
  const before = lots.find((l) => l.status === "active") ?? null;
  const plan = planConsumption(lots, units);
  for (const step of plan.steps) {
    await tx.stockLot.update({
      where: { id: step.lotId },
      data: { consumedQty: { increment: step.quantity } },
    });
    await tx.stockLotConsumption.upsert({
      where: { lotId_movementId: { lotId: step.lotId, movementId: movement.id } },
      create: { organizationId, lotId: step.lotId, movementId: movement.id, quantity: step.quantity },
      update: { quantity: { increment: step.quantity } },
    });
  }
  if (plan.depleted.length > 0) {
    await tx.stockLot.updateMany({
      where: { organizationId, id: { in: plan.depleted } },
      data: { status: "depleted", depletedAt: movement.occurredAt },
    });
  }
  const after = plan.currentLotId;
  if (after && after !== before?.id) {
    await tx.stockLot.update({
      where: { id: after },
      data: { status: "active", activatedAt: movement.occurredAt },
    });
    if (before) {
      switches.push({ stockItemId: movement.stockItemId, fromLotId: before.id, toLotId: after, at: movement.occurredAt });
    }
  }
}

async function giveBack(
  tx: Tx,
  organizationId: string,
  movement: AllocatableMovement,
  units: number,
  originMovementIds: string[],
) {
  let remaining = units;
  // Estorno: volta para o lote de onde saiu, se ainda aberto.
  if (originMovementIds.length > 0) {
    const origin = await tx.stockLotConsumption.findMany({
      where: { organizationId, movementId: { in: originMovementIds }, quantity: { gt: 0 } },
      include: { lot: { select: { status: true } } },
      orderBy: { createdAt: "desc" },
    });
    for (const c of origin) {
      if (remaining <= 0) break;
      if (c.lot.status === "depleted") continue;
      const back = Math.min(c.quantity, remaining);
      await tx.stockLot.update({ where: { id: c.lotId }, data: { consumedQty: { decrement: back } } });
      await tx.stockLotConsumption.upsert({
        where: { lotId_movementId: { lotId: c.lotId, movementId: movement.id } },
        create: { organizationId, lotId: c.lotId, movementId: movement.id, quantity: -back },
        update: { quantity: { decrement: back } },
      });
      remaining -= back;
    }
  }
  if (remaining <= 0) return;
  // Resto: lote vigente (ou, sem vigente, o mais novo).
  const lots = await openLots(tx, organizationId, movement.stockItemId);
  const target =
    lots.find((l) => l.status === "active") ??
    [...lots].sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())[0];
  if (!target) return;
  // Devolver mais do que foi consumido aumenta o lote (achou mercadoria a mais).
  const fromConsumed = Math.min(remaining, target.consumedQty);
  const extra = remaining - fromConsumed;
  await tx.stockLot.update({
    where: { id: target.id },
    data: {
      consumedQty: { decrement: fromConsumed },
      ...(extra > 0 ? { quantity: { increment: extra } } : {}),
    },
  });
  await tx.stockLotConsumption.upsert({
    where: { lotId_movementId: { lotId: target.id, movementId: movement.id } },
    create: { organizationId, lotId: target.id, movementId: movement.id, quantity: -remaining },
    update: { quantity: { decrement: remaining } },
  });
}

/**
 * Aplica o PEPS às movimentações recém-criadas (na ordem em que aconteceram)
 * e, quando um lote acaba, troca o custo vigente.
 */
export async function allocateLotsForMovements(
  tx: Tx,
  organizationId: string,
  movements: AllocatableMovement[],
): Promise<void> {
  const ordered = [...movements].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const switches: LotSwitch[] = [];
  for (const movement of ordered) {
    const effect = lotEffect(movement);
    if (movement.type === "entry") {
      // Entrada com o lote vigente já zerado: o custo novo passa a valer agora.
      await consume(tx, organizationId, movement, 0, switches);
      continue;
    }
    if (effect > 0) {
      await consume(tx, organizationId, movement, effect, switches);
    } else if (effect < 0) {
      let origins: string[] = [];
      if (movement.type === "sale_reversal") {
        const reversal = await tx.stockMovement.findUnique({
          where: { id: movement.id },
          select: { sourceType: true, sourceId: true, sourceLineKey: true },
        });
        if (reversal) {
          origins = (
            await tx.stockMovement.findMany({
              where: {
                organizationId,
                stockItemId: movement.stockItemId,
                type: "sale",
                sourceType: reversal.sourceType,
                sourceId: reversal.sourceId,
                sourceLineKey: reversal.sourceLineKey,
              },
              select: { id: true },
            })
          ).map((m) => m.id);
        }
      }
      await giveBack(tx, organizationId, movement, -effect, origins);
    }
  }
  for (const sw of switches) await applyCostSwitch(tx, organizationId, sw);
}

function costFieldsOf(lot: Pick<StockLot, "unitCostNf" | "purchaseIcmsPercent" | "hasIcmsSt" | "purchaseCostWithSt" | "ipiPercent" | "extraCosts">) {
  return {
    unitCostNf: lot.unitCostNf,
    purchaseIcmsPercent: lot.purchaseIcmsPercent,
    hasIcmsSt: lot.hasIcmsSt,
    purchaseCostWithSt: lot.hasIcmsSt ? lot.purchaseCostWithSt : null,
    ipiPercent: lot.ipiPercent,
    extraCosts: lot.extraCosts,
  };
}

function sameCost(a: ReturnType<typeof costFieldsOf>, b: ReturnType<typeof costFieldsOf>): boolean {
  const eq = (x: unknown, y: unknown) => Math.abs(Number(x ?? 0) - Number(y ?? 0)) < 0.00005;
  return (
    eq(a.unitCostNf, b.unitCostNf) &&
    eq(a.purchaseIcmsPercent, b.purchaseIcmsPercent) &&
    a.hasIcmsSt === b.hasIcmsSt &&
    eq(a.purchaseCostWithSt, b.purchaseCostWithSt) &&
    eq(a.ipiPercent, b.ipiPercent) &&
    eq(a.extraCosts, b.extraCosts)
  );
}

function shiftYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Troca o custo vigente: cadastros das opções de venda + nivelamento do período antigo no DRE. */
async function applyCostSwitch(tx: Tx, organizationId: string, sw: LotSwitch): Promise<void> {
  const [fromLot, toLot] = await Promise.all([
    tx.stockLot.findUnique({ where: { id: sw.fromLotId } }),
    tx.stockLot.findUnique({ where: { id: sw.toLotId } }),
  ]);
  if (!fromLot || !toLot || !toLot.costKnown) return;
  const oldCost = costFieldsOf(fromLot);
  const newCost = costFieldsOf(toLot);
  if (fromLot.costKnown && sameCost(oldCost, newCost)) return;

  const listings = await tx.listing.findMany({
    where: { organizationId, stockItemId: sw.stockItemId },
    select: { mlItemId: true },
  });
  const products = await tx.product.findMany({
    where: { organizationId, mlItemId: { in: listings.map((l) => l.mlItemId) } },
  });
  const switchYmd = zonedYmd(sw.at, reportsConfig.catalogCompetitionTimezone);
  const endYmd = shiftYmd(switchYmd, -1);

  for (const product of products) {
    // Nivelamento do período em que o custo antigo valeu (só com custo conhecido).
    if (fromLot.costKnown) {
      const sku = normalizeProductSku(product.sku ?? product.mlItemId);
      const existing = await tx.dreProductCostLeveling.findMany({
        where: { organizationId, ...levelingScope(product.mlItemId, sku) },
        select: { endDate: true },
      });
      const latestEnd = existing.reduce<string | null>((max, row) => {
        const ymd = row.endDate.toISOString().slice(0, 10);
        return !max || ymd > max ? ymd : max;
      }, null);
      const startYmd = latestEnd ? shiftYmd(latestEnd, 1) : product.createdAt.toISOString().slice(0, 10);
      if (startYmd <= endYmd) {
        await tx.dreProductCostLeveling.create({
          data: {
            organizationId,
            sku,
            productMlItemId: product.mlItemId,
            startDate: new Date(`${startYmd}T00:00:00.000Z`),
            endDate: new Date(`${endYmd}T00:00:00.000Z`),
            hasIcmsSt: oldCost.hasIcmsSt,
            unitCostNf: oldCost.unitCostNf,
            purchaseCostWithSt: oldCost.purchaseCostWithSt,
            ipiPercent: oldCost.ipiPercent,
            purchaseIcmsPercent: oldCost.purchaseIcmsPercent,
            extraCosts: oldCost.extraCosts,
            isMonophasic: product.isMonophasic,
            saleIcmsPercent: product.saleIcmsPercent,
            isImported: product.isImported,
            pmaPrice: product.pmaPrice,
          },
        });
      }
    }
    await tx.product.update({
      where: { mlItemId: product.mlItemId },
      data: {
        unitCostNf: newCost.unitCostNf,
        purchaseIcmsPercent: newCost.purchaseIcmsPercent,
        hasIcmsSt: newCost.hasIcmsSt,
        purchaseCostWithSt: newCost.purchaseCostWithSt,
        ipiPercent: newCost.ipiPercent,
        extraCosts: newCost.extraCosts,
      },
    });
  }
}

const LOT_COST_FIELDS = new Set([
  "unitCostNf",
  "purchaseIcmsPercent",
  "hasIcmsSt",
  "purchaseCostWithSt",
  "ipiPercent",
  "extraCosts",
]);

/**
 * Cadastro do produto editado depois da ativação: o custo corrigido vale para
 * o lote vigente do item (é correção, não custo novo — custo novo entra pela
 * entrada de mercadoria). Sem estoque automático, não faz nada.
 */
export async function syncActiveLotCostFromProduct(
  organizationId: string,
  mlItemId: string,
  changedFields: string[],
): Promise<void> {
  if (!changedFields.some((f) => LOT_COST_FIELDS.has(f))) return;
  const listing = await prisma.listing.findFirst({
    where: { organizationId, mlItemId },
    select: { stockItemId: true },
  });
  if (!listing?.stockItemId) return;
  const product = await prisma.product.findFirst({ where: { organizationId, mlItemId } });
  if (!product || product.needsCostReview) return;
  await prisma.stockLot.updateMany({
    where: { organizationId, stockItemId: listing.stockItemId, status: "active" },
    data: {
      costKnown: true,
      unitCostNf: product.unitCostNf,
      purchaseIcmsPercent: product.purchaseIcmsPercent,
      hasIcmsSt: product.hasIcmsSt,
      purchaseCostWithSt: product.hasIcmsSt ? product.purchaseCostWithSt : null,
      ipiPercent: product.ipiPercent,
      extraCosts: product.extraCosts,
    },
  });
}
