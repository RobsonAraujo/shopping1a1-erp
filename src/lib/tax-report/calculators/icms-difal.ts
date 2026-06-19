import { roundMoney } from "@/lib/financial-margin";
import {
  IMPORT_CONTENT_THRESHOLD_PERCENT,
  SUDESTE_SUL_INTERESTADUAL_UFS,
  normalizeUf,
} from "@/lib/tax-report/config";
import type {
  IcmsDifalBreakdown,
  IcmsRateRow,
  TransacaoVenda,
} from "@/lib/tax-report/types";

export function obterAliquotaInterestadual(input: {
  ufDestino: string;
  ufOrigem: string;
  mercadoriaImportada: boolean;
  conteudoImportacaoPercentual: number;
}): number {
  const destino = normalizeUf(input.ufDestino);
  const origem = normalizeUf(input.ufOrigem);
  if (!destino || !origem) return 0;

  if (origem === destino) {
    return 0;
  }

  if (
    input.mercadoriaImportada &&
    input.conteudoImportacaoPercentual > IMPORT_CONTENT_THRESHOLD_PERCENT
  ) {
    return 0.04;
  }

  if (SUDESTE_SUL_INTERESTADUAL_UFS.has(destino)) {
    return 0.12;
  }

  return 0.07;
}

export function aliquotaInternaTotal(
  uf: string,
  rates: Map<string, IcmsRateRow>,
): number {
  const normalized = normalizeUf(uf);
  if (!normalized) return 0;
  const row = rates.get(normalized);
  if (!row) return 0;
  return row.aliquotaBase + row.fcp;
}

export function isContribuinteIcms(
  transacao: TransacaoVenda,
): boolean {
  if (transacao.tipoDocumento === "CPF") return false;
  if (transacao.contribuinteIcms === true) return true;
  if (transacao.contribuinteIcms === false) return false;
  return false;
}

export type IcmsDifalInput = {
  transacao: TransacaoVenda;
  ufOrigem: string;
  rates: Map<string, IcmsRateRow>;
};

export function calcularIcmsDifal(input: IcmsDifalInput): IcmsDifalBreakdown | null {
  const { transacao, ufOrigem, rates } = input;
  const ufDestino = normalizeUf(transacao.ufDestino);
  const origem = normalizeUf(ufOrigem);
  if (!ufDestino || !origem) return null;

  const receita = transacao.receitaBruta;
  const interna = aliquotaInternaTotal(ufDestino, rates);
  const isOperacaoInterna = origem === ufDestino;

  if (isOperacaoInterna) {
    const icmsTotal = roundMoney(receita * interna);
    return {
      ufOrigem: origem,
      ufDestino,
      aliquotaInterestadual: 0,
      aliquotaInternaTotal: interna,
      icmsInterestadual: 0,
      difal: 0,
      icmsTotal,
      isContribuinte: false,
      isOperacaoInterna: true,
    };
  }

  const interestadual = obterAliquotaInterestadual({
    ufDestino,
    ufOrigem: origem,
    mercadoriaImportada: transacao.mercadoriaImportada,
    conteudoImportacaoPercentual: transacao.conteudoImportacaoPercentual,
  });

  const contribuinte = isContribuinteIcms(transacao);
  const icmsInterestadual = roundMoney(receita * interestadual);

  if (contribuinte) {
    return {
      ufOrigem: origem,
      ufDestino,
      aliquotaInterestadual: interestadual,
      aliquotaInternaTotal: interna,
      icmsInterestadual,
      difal: 0,
      icmsTotal: icmsInterestadual,
      isContribuinte: true,
      isOperacaoInterna: false,
    };
  }

  const difalRate = Math.max(0, interna - interestadual);
  const difal = roundMoney(receita * difalRate);

  return {
    ufOrigem: origem,
    ufDestino,
    aliquotaInterestadual: interestadual,
    aliquotaInternaTotal: interna,
    icmsInterestadual,
    difal,
    icmsTotal: roundMoney(icmsInterestadual + difal),
    isContribuinte: false,
    isOperacaoInterna: false,
  };
}

export function buildIcmsMemoria(result: IcmsDifalBreakdown): string[] {
  if (result.isOperacaoInterna) {
    return [
      `Operação interna ${result.ufOrigem} → ${result.ufDestino}`,
      `Alíquota interna ${(result.aliquotaInternaTotal * 100).toFixed(2)}%`,
      `ICMS = R$ ${result.icmsTotal.toFixed(2)}`,
    ];
  }

  const lines = [
    `Operação interestadual ${result.ufOrigem} → ${result.ufDestino}`,
    `Alíquota interestadual ${(result.aliquotaInterestadual * 100).toFixed(2)}%`,
    `ICMS interestadual = R$ ${result.icmsInterestadual.toFixed(2)}`,
  ];

  if (result.isContribuinte) {
    lines.push("Comprador contribuinte ICMS — sem DIFAL (EC 87/2015)");
  } else {
    lines.push(
      `Alíquota interna destino ${(result.aliquotaInternaTotal * 100).toFixed(2)}%`,
    );
    lines.push(`DIFAL = R$ ${result.difal.toFixed(2)}`);
  }

  lines.push(`ICMS total = R$ ${result.icmsTotal.toFixed(2)}`);
  return lines;
}

/** ICMS destacado usado para excluir da base PIS/COFINS */
export function icmsDestacadoParaBase(
  icms: IcmsDifalBreakdown | null,
): number {
  return icms?.icmsTotal ?? 0;
}

/** ICMS próprio/interno ou interestadual — sem a parcela DIFAL (UF destino). */
export function icmsSemDifal(icms: IcmsDifalBreakdown | null): number {
  if (!icms) return 0;
  return roundMoney(icms.icmsTotal - icms.difal);
}
