import { roundMoney } from "@/lib/pricing/financial-margin";
import {
  isIcmsStRecuperavelAplicavel,
  purchaseIcmsCreditUnit,
} from "@/lib/pricing/product-pricing";
import type {
  IcmsCreditoCompraBreakdown,
  TransacaoVenda,
} from "@/lib/tax-report/types";

/**
 * ICMS-ST recuperável quando um produto comprado com ST é vendido para outro
 * estado: o fato gerador presumido (venda dentro da UF de origem) não se
 * confirma, então o ICMS-ST pago na entrada é, em tese, recuperável (Tema
 * 201/STF, Convênio ICMS 142/2018). Estimado pela diferença entre o custo
 * com ST e o custo NF (não há campo separado para o valor do ST na NF).
 */
function icmsStRecuperavelUnit(input: {
  unitCostNf: number;
  purchaseCostWithSt: number | null | undefined;
  hasIcmsSt: boolean;
  isOperacaoInterna: boolean;
  considerarStRecuperavel: boolean;
}): number {
  if (!isIcmsStRecuperavelAplicavel(input)) {
    return 0;
  }
  const { purchaseCostWithSt, unitCostNf } = input;
  if (
    purchaseCostWithSt == null ||
    !Number.isFinite(purchaseCostWithSt) ||
    purchaseCostWithSt <= unitCostNf
  ) {
    return 0;
  }
  return roundMoney(purchaseCostWithSt - unitCostNf);
}

export function calcularIcmsCreditoCompra(
  transacao: TransacaoVenda,
  isOperacaoInterna = true,
  considerarStRecuperavel = true,
): IcmsCreditoCompraBreakdown {
  const unitCostNf = transacao.unitCostNf;
  if (unitCostNf == null || unitCostNf <= 0) {
    return {
      baseUnitaria: 0,
      aliquotaPercent: 0,
      creditoTotal: 0,
      stRecuperavelTotal: 0,
    };
  }

  const creditoUnitario = purchaseIcmsCreditUnit({
    unitCostNf,
    purchaseIcmsPercent: transacao.purchaseIcmsPercent,
    hasIcmsSt: transacao.hasIcmsSt,
    isOperacaoInterna,
    considerarStRecuperavel,
  });

  const stRecuperavelUnitario = icmsStRecuperavelUnit({
    unitCostNf,
    purchaseCostWithSt: transacao.purchaseCostWithSt,
    hasIcmsSt: transacao.hasIcmsSt,
    isOperacaoInterna,
    considerarStRecuperavel,
  });
  const stRecuperavelTotal = roundMoney(
    stRecuperavelUnitario * transacao.quantidade,
  );

  return {
    baseUnitaria: roundMoney(unitCostNf * transacao.quantidade),
    aliquotaPercent:
      transacao.hasIcmsSt && isOperacaoInterna ? 0 : transacao.purchaseIcmsPercent,
    creditoTotal: roundMoney(
      creditoUnitario * transacao.quantidade + stRecuperavelTotal,
    ),
    stRecuperavelTotal,
  };
}

export function buildIcmsCreditoMemoria(
  result: IcmsCreditoCompraBreakdown,
): string[] {
  const stRecuperavelTotal = result.stRecuperavelTotal ?? 0;
  const creditoEntradaTotal = roundMoney(result.creditoTotal - stRecuperavelTotal);
  const lines: string[] = [];

  if (creditoEntradaTotal > 0) {
    lines.push(`Base NF entrada: R$ ${result.baseUnitaria.toFixed(2)}`);
    lines.push(`Alíquota ICMS entrada ${result.aliquotaPercent.toFixed(2)}%`);
    lines.push(`(=) Crédito ICMS compra: R$ ${creditoEntradaTotal.toFixed(2)}`);
  } else if (stRecuperavelTotal <= 0) {
    lines.push("Crédito ICMS na compra: R$ 0,00 (sem base ou ST)");
  }

  if (stRecuperavelTotal > 0) {
    lines.push(
      `Venda interestadual de produto com ICMS-ST — ressarcimento estimado: R$ ${stRecuperavelTotal.toFixed(2)}`,
    );
  }

  return lines;
}
