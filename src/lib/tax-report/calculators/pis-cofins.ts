import { roundMoney } from "@/lib/financial-margin";
import type { PisCofinsBreakdown, TaxCompanyConfig, TransacaoVenda } from "@/lib/tax-report/types";

export type PisCofinsInput = {
  transacao: TransacaoVenda;
  config: TaxCompanyConfig;
  icmsDestacado: number;
};

export function calcularPisCofins(input: PisCofinsInput): PisCofinsBreakdown {
  const { transacao, config, icmsDestacado } = input;

  if (transacao.isMonophasic) {
    return {
      baseDebito: 0,
      pisDebito: 0,
      cofinsDebito: 0,
      debitoTotal: 0,
      pisCredito: 0,
      cofinsCredito: 0,
      creditoTotal: 0,
      liquido: 0,
      icmsExcluidoDaBase: 0,
      excludedIcmsFromBase: config.excludeIcmsFromPisCofinsBase,
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

  const custoBase =
    (transacao.custoAquisicaoUnitario ?? 0) * transacao.quantidade;
  const pisCredito = roundMoney(custoBase * pisRate);
  const cofinsCredito = roundMoney(custoBase * cofinsRate);
  const creditoTotal = roundMoney(pisCredito + cofinsCredito);

  return {
    baseDebito: roundMoney(baseDebito),
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
  lines.push(
    `(−) Crédito PIS/COFINS sobre CMV: R$ ${result.creditoTotal.toFixed(2)}`,
  );
  lines.push(`(=) PIS/COFINS líquido: R$ ${result.liquido.toFixed(2)}`);
  return lines;
}
