import { roundMoney } from "@/lib/financial-margin";
import type { IrpjCsllBreakdown, TaxCompanyConfig } from "@/lib/tax-report/types";

const IRPJ_BASE_RATE = 0.15;
const IRPJ_ADDITIONAL_RATE = 0.1;
const CSLL_RATE = 0.09;

export type IrpjCsllTransacaoInput = {
  receitaBruta: number;
  cmvTotal: number;
  impostosOperacionais: number;
};

/** Estimativa gerencial por transação (sem adicional trimestral por venda). */
export function estimarIrpjCslPorTransacao(
  input: IrpjCsllTransacaoInput,
): IrpjCsllBreakdown {
  const baseLucro = roundMoney(
    input.receitaBruta - input.cmvTotal - input.impostosOperacionais,
  );
  const irpjBase = roundMoney(Math.max(0, baseLucro) * IRPJ_BASE_RATE);
  const csll = roundMoney(Math.max(0, baseLucro) * CSLL_RATE);

  return {
    baseLucro,
    irpjBase,
    csll,
    irpjAdicional: 0,
    irpjTotal: irpjBase,
    isEstimativaGerencial: true,
  };
}

export function consolidarIrpjCslMensal(
  basesLucro: number[],
  config: TaxCompanyConfig,
): { irpjTotal: number; csllTotal: number; irpjAdicional: number } {
  const lucroConsolidado = roundMoney(
    basesLucro.reduce((sum, b) => sum + b, 0),
  );
  const lucroPositivo = Math.max(0, lucroConsolidado);
  const csllTotal = roundMoney(lucroPositivo * CSLL_RATE);
  const irpjBase = roundMoney(lucroPositivo * IRPJ_BASE_RATE);

  const excedente = Math.max(
    0,
    lucroPositivo - config.irpjAdditionalThreshold,
  );
  const irpjAdicional = roundMoney(excedente * IRPJ_ADDITIONAL_RATE);
  const irpjTotal = roundMoney(irpjBase + irpjAdicional);

  return { irpjTotal, csllTotal, irpjAdicional };
}

export function buildIrpjMemoria(
  result: IrpjCsllBreakdown,
  mensal?: { irpjAdicional: number },
): string[] {
  const lines = [
    `Base de lucro estimada: R$ ${result.baseLucro.toFixed(2)}`,
    `IRPJ 15% = R$ ${result.irpjBase.toFixed(2)}`,
    `CSLL 9% = R$ ${result.csll.toFixed(2)}`,
  ];
  if (mensal && mensal.irpjAdicional > 0) {
    lines.push(
      `(+) Adicional IRPJ 10% sobre excedente mensal: R$ ${mensal.irpjAdicional.toFixed(2)}`,
    );
  }
  lines.push("Estimativa gerencial — não substitui apuração contábil/LALUR.");
  return lines;
}
