import { roundMoney } from "@/lib/financial-margin";
import { purchasePisCofinsCreditBaseUnit } from "@/lib/product-pricing";
import type { PisCofinsBreakdown, TaxCompanyConfig, TransacaoVenda } from "@/lib/tax-report/types";

export type PisCofinsInput = {
  transacao: TransacaoVenda;
  config: TaxCompanyConfig;
  icmsDestacado: number;
  isOperacaoInterna: boolean;
};

export function calcularPisCofins(input: PisCofinsInput): PisCofinsBreakdown {
  const { transacao, config, icmsDestacado, isOperacaoInterna } = input;

  if (transacao.isMonophasic) {
    return {
      baseDebito: 0,
      baseCredito: 0,
      pisDebito: 0,
      cofinsDebito: 0,
      debitoTotal: 0,
      pisCredito: 0,
      cofinsCredito: 0,
      creditoTotal: 0,
      liquido: 0,
      icmsExcluidoDaBase: 0,
      excludedIcmsFromBase: config.excludeIcmsFromPisCofinsBase,
      pisRatePercent: config.pisRatePercent,
      cofinsRatePercent: config.cofinsRatePercent,
    };
  }

  const pisRate = config.pisRatePercent / 100;
  const cofinsRate = config.cofinsRatePercent / 100;

  const baseDebito = config.excludeIcmsFromPisCofinsBase
    ? Math.max(0, transacao.receitaBruta - icmsDestacado)
    : transacao.receitaBruta;

  const pisDebito = roundMoney(baseDebito * pisRate);
  const cofinsDebito = roundMoney(baseDebito * cofinsRate);
  const debitoTotal = roundMoney(pisDebito + cofinsDebito);

  const unitCostNf = transacao.unitCostNf;
  const baseCreditoUnit =
    unitCostNf != null && unitCostNf > 0
      ? purchasePisCofinsCreditBaseUnit({
          unitCostNf,
          purchaseIcmsPercent: transacao.purchaseIcmsPercent,
          hasIcmsSt: transacao.hasIcmsSt,
          purchaseCostWithSt: transacao.purchaseCostWithSt,
          isOperacaoInterna,
          considerarStRecuperavel: config.considerIcmsStRecuperavel,
        })
      : 0;
  const baseCredito = roundMoney(baseCreditoUnit * transacao.quantidade);

  const pisCredito = roundMoney(baseCredito * pisRate);
  const cofinsCredito = roundMoney(baseCredito * cofinsRate);
  const creditoTotal = roundMoney(pisCredito + cofinsCredito);

  return {
    baseDebito: roundMoney(baseDebito),
    baseCredito,
    pisDebito,
    cofinsDebito,
    debitoTotal,
    pisCredito,
    cofinsCredito,
    creditoTotal,
    liquido: roundMoney(debitoTotal - creditoTotal),
    icmsExcluidoDaBase: config.excludeIcmsFromPisCofinsBase
      ? roundMoney(icmsDestacado)
      : 0,
    excludedIcmsFromBase: config.excludeIcmsFromPisCofinsBase,
    pisRatePercent: config.pisRatePercent,
    cofinsRatePercent: config.cofinsRatePercent,
  };
}

export function buildPisCofinsMemoria(
  result: PisCofinsBreakdown,
  config: TaxCompanyConfig,
): string[] {
  const lines = [`Receita bruta considerada na base`];
  if (result.excludedIcmsFromBase) {
    lines.push(
      `(−) ICMS destacado excluído da base PIS/COFINS (RE 574.706): R$ ${result.icmsExcluidoDaBase.toFixed(2)}`,
    );
  }
  lines.push(`(=) Base débito: R$ ${result.baseDebito.toFixed(2)}`);
  lines.push(
    `PIS ${config.pisRatePercent}% = R$ ${result.pisDebito.toFixed(2)} | COFINS ${config.cofinsRatePercent}% = R$ ${result.cofinsDebito.toFixed(2)}`,
  );
  lines.push(`(=) Base crédito (custo NF total): R$ ${result.baseCredito.toFixed(2)}`);
  lines.push(
    `(−) Crédito PIS ${config.pisRatePercent}% = R$ ${result.pisCredito.toFixed(2)} | COFINS ${config.cofinsRatePercent}% = R$ ${result.cofinsCredito.toFixed(2)}`,
  );
  const liquidoPct = result.baseDebito > 0
    ? ((result.liquido / result.baseDebito) * 100).toFixed(2)
    : "0,00";
  lines.push(`(=) PIS/COFINS líquido: ${liquidoPct}% (R$ ${result.liquido.toFixed(2)})`);
  return lines;
}
