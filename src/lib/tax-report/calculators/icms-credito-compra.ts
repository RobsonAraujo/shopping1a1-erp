import { roundMoney } from "@/lib/financial-margin";
import { purchaseIcmsCreditUnit } from "@/lib/product-pricing";
import type {
  IcmsCreditoCompraBreakdown,
  TransacaoVenda,
} from "@/lib/tax-report/types";

export function calcularIcmsCreditoCompra(
  transacao: TransacaoVenda,
): IcmsCreditoCompraBreakdown {
  const unitCostNf = transacao.unitCostNf;
  if (unitCostNf == null || unitCostNf <= 0) {
    return {
      baseUnitaria: 0,
      aliquotaPercent: 0,
      creditoTotal: 0,
    };
  }

  const creditoUnitario = purchaseIcmsCreditUnit({
    unitCostNf,
    purchaseIcmsPercent: transacao.purchaseIcmsPercent,
    hasIcmsSt: transacao.hasIcmsSt,
  });

  return {
    baseUnitaria: roundMoney(unitCostNf * transacao.quantidade),
    aliquotaPercent: transacao.hasIcmsSt ? 0 : transacao.purchaseIcmsPercent,
    creditoTotal: roundMoney(creditoUnitario * transacao.quantidade),
  };
}

export function buildIcmsCreditoMemoria(
  result: IcmsCreditoCompraBreakdown,
): string[] {
  if (result.creditoTotal <= 0) {
    return ["Crédito ICMS na compra: R$ 0,00 (sem base ou ST)"];
  }
  return [
    `Base NF entrada: R$ ${result.baseUnitaria.toFixed(2)}`,
    `Alíquota ICMS entrada ${result.aliquotaPercent.toFixed(2)}%`,
    `(=) Crédito ICMS compra: R$ ${result.creditoTotal.toFixed(2)}`,
  ];
}
