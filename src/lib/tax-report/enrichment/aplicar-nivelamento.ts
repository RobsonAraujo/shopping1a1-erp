import { findLevelingForOrderDate } from "@/lib/dre/dre-product-cost-leveling-shared";
import type { DreProductCostLevelingRecord } from "@/lib/dre/dre-product-cost-leveling-shared";
import { orderDateYmdFromOrder } from "@/lib/mercadolibre/api";
import { normalizeProductSku } from "@/lib/pricing/product-pricing";
import type { CustoLookup, CustoProduto } from "@/lib/tax-report/enrichment/obter-custo-por-sku";
import type { TransacaoVenda } from "@/lib/tax-report/types";

/**
 * Custo do produto na data da venda: o nivelamento do DRE guarda o histórico
 * do cadastro (custo NF, ICMS da compra, ST, IPI…) por período. Sem ele, o
 * relatório de um mês passado usava o cadastro de hoje nos créditos da
 * compra — e o % de imposto do produto não batia com o Custo produto do DRE,
 * que já usava o nivelamento. Campos não informados no nivelamento (registros
 * antigos) ficam com o cadastro atual.
 */
export function applyLevelingToCusto(
  custo: CustoProduto | undefined,
  leveling: DreProductCostLevelingRecord,
): CustoProduto {
  return {
    sku: custo?.sku ?? leveling.sku,
    pricingCost: leveling.pricingCost,
    unitCostNf: leveling.unitCostNf > 0 ? leveling.unitCostNf : null,
    purchaseIcmsPercent:
      leveling.purchaseIcmsPercent ?? custo?.purchaseIcmsPercent ?? 0,
    hasIcmsSt: leveling.hasIcmsSt,
    purchaseCostWithSt: leveling.hasIcmsSt ? leveling.purchaseCostWithSt : null,
    saleIcmsPercent: leveling.saleIcmsPercent ?? custo?.saleIcmsPercent ?? 0,
    extraCosts: leveling.extraCosts ?? custo?.extraCosts ?? 0,
    isMonophasic: leveling.isMonophasic ?? custo?.isMonophasic ?? false,
    isImported: leveling.isImported ?? custo?.isImported ?? false,
    ipiPercent: leveling.ipiPercent,
  };
}

export type CustoDaVenda = {
  custo: CustoProduto | undefined;
  fonte: NonNullable<TransacaoVenda["custoFonte"]>;
};

/**
 * Cadastro do produto que vale para uma venda: o nivelamento que cobre o dia
 * do pedido (fuso de São Paulo, mesmo casamento do DRE — por anúncio, com o
 * texto de SKU só para nivelamentos antigos), senão o cadastro atual.
 */
export function resolveCustoDaVenda(input: {
  itemId: string;
  sku: string;
  orderDate: string;
  custoLookup: CustoLookup;
  levelings: readonly DreProductCostLevelingRecord[];
  year: number;
  month: number;
}): CustoDaVenda {
  const base =
    (input.itemId ? input.custoLookup.byMlItemId.get(input.itemId) : undefined) ??
    input.custoLookup.bySku.get(normalizeProductSku(input.sku));
  if (input.levelings.length === 0) return { custo: base, fonte: "cadastro" };
  const leveling = findLevelingForOrderDate(
    input.levelings,
    input.itemId || null,
    input.sku,
    orderDateYmdFromOrder({ date_closed: input.orderDate }),
    input.year,
    input.month,
  );
  if (!leveling) return { custo: base, fonte: "cadastro" };
  return { custo: applyLevelingToCusto(base, leveling), fonte: "nivelamento" };
}
