import { prisma } from "@/lib/db/db";
import {
  buildExplicitFixedCostMap,
  resolveEffectiveFixedCostsForYear,
} from "@/lib/dre/dre-fixed-costs";
import { loadTaxFixedCostItemsWithMonthValue } from "@/lib/tax-report/tax-fixed-cost-data";

/**
 * Atalho de cadastro: oferece os custos fixos já lançados no DRE pra virarem
 * custos fixos com crédito no Tributário. É uma **cópia** (nome, valor do mês,
 * recorrência) pras tabelas `TaxFixedCost*` — o cálculo do relatório continua
 * lendo só elas, então nada aqui altera a apuração. Não há vínculo no banco:
 * a correspondência DRE ↔ Tributário é pelo nome normalizado.
 */

export type DreFixedCostSuggestion = {
  dreCostItemId: string;
  name: string;
  recurring: boolean;
  /** Valor efetivo do item no DRE pro mês pedido (explícito ou herdado). */
  amount: number;
  /** Custo fixo do Tributário com o mesmo nome, se já importado/cadastrado. */
  taxItemId: string | null;
  /** Valor desse custo no Tributário no mês — pra sinalizar divergência. */
  taxAmount: number | null;
};

export function normalizeCostName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

async function loadDreFixedCostsForMonth(
  organizationId: string,
  year: number,
  month: number,
): Promise<Array<{ id: string; name: string; recurring: boolean; amount: number }>> {
  const [items, values] = await Promise.all([
    prisma.dreCostItem.findMany({
      where: { organizationId, active: true, section: "FIXED" },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, recurring: true },
    }),
    prisma.dreCostMonthValue.findMany({
      where: { organizationId, year: { in: [year - 1, year] } },
      select: { costItemId: true, year: true, month: true, amount: true },
    }),
  ]);

  const effective = resolveEffectiveFixedCostsForYear(
    items.map((item) => item.id),
    year,
    buildExplicitFixedCostMap(values),
    new Map(items.map((item) => [item.id, item.recurring] as const)),
  )[month];

  return items.flatMap((item) => {
    const amount = effective?.[item.id];
    return amount != null && amount > 0 ? [{ ...item, amount }] : [];
  });
}

export async function loadDreFixedCostSuggestions(
  organizationId: string,
  year: number,
  month: number,
): Promise<DreFixedCostSuggestion[]> {
  const [dreItems, taxItems] = await Promise.all([
    loadDreFixedCostsForMonth(organizationId, year, month),
    loadTaxFixedCostItemsWithMonthValue(organizationId, year, month),
  ]);

  const taxByName = new Map(
    taxItems
      .filter((item) => item.status !== "ended")
      .map((item) => [normalizeCostName(item.name), item] as const),
  );

  return dreItems.map((item) => {
    const match = taxByName.get(normalizeCostName(item.name));
    return {
      dreCostItemId: item.id,
      name: item.name,
      recurring: item.recurring,
      amount: item.amount,
      taxItemId: match?.id ?? null,
      taxAmount: match?.amount ?? null,
    };
  });
}

/**
 * Copia os custos fixos do DRE selecionados pro Tributário. Os valores são
 * relidos do DRE aqui (não confia no cliente); itens que já existem no
 * Tributário com o mesmo nome são ignorados pra não duplicar crédito.
 */
export async function importDreFixedCosts(
  organizationId: string,
  year: number,
  month: number,
  dreCostItemIds: string[],
): Promise<{ created: number; skipped: number }> {
  const selected = new Set(dreCostItemIds);
  const suggestions = (
    await loadDreFixedCostSuggestions(organizationId, year, month)
  ).filter((item) => selected.has(item.dreCostItemId));
  const toCreate = suggestions.filter((item) => item.taxItemId == null);

  if (toCreate.length > 0) {
    await prisma.$transaction(async (tx) => {
      const maxSort = await tx.taxFixedCostItem.aggregate({
        where: { organizationId, active: true },
        _max: { sortOrder: true },
      });
      let sortOrder = maxSort._max.sortOrder ?? 0;
      for (const item of toCreate) {
        sortOrder += 1;
        await tx.taxFixedCostItem.create({
          data: {
            organizationId,
            name: item.name,
            recurring: item.recurring,
            sortOrder,
            monthValues: {
              create: { organizationId, year, month, amount: item.amount },
            },
          },
        });
      }
    });
  }

  return {
    created: toCreate.length,
    skipped: dreCostItemIds.length - toCreate.length,
  };
}
