import { roundMoney } from "@/lib/pricing/financial-margin";
import { formatNcm } from "@/lib/tax-incentives/ncm";
import { icmsIncentiveAppliesToBuyer } from "@/lib/tax-incentives/resolve";
import {
  UFS_SUL_SUDESTE_SEM_ES,
  normalizeUf,
} from "@/lib/tax-report/config";
import type {
  IcmsDifalBreakdown,
  IcmsRateRow,
  TransacaoVenda,
} from "@/lib/tax-report/types";

/**
 * Alíquota interestadual (Resolução do Senado 22/1989 e 13/2012):
 * importado 4%; origem Sul/Sudeste (sem ES) → destino N/NE/CO/ES 7%;
 * qualquer outra operação interestadual 12%.
 */
export function obterAliquotaInterestadual(input: {
  ufDestino: string;
  ufOrigem: string;
  mercadoriaImportada: boolean;
}): number {
  const destino = normalizeUf(input.ufDestino);
  const origem = normalizeUf(input.ufOrigem);
  if (!destino || !origem) return 0;

  if (origem === destino) {
    return 0;
  }

  if (input.mercadoriaImportada) {
    return 0.04;
  }

  if (
    UFS_SUL_SUDESTE_SEM_ES.has(origem) &&
    !UFS_SUL_SUDESTE_SEM_ES.has(destino)
  ) {
    return 0.07;
  }

  return 0.12;
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

/**
 * Alíquota ICMS na saída em operação interna (mesma UF).
 * ST na compra → 0% (imposto já recolhido pelo substituto tributário).
 * Incentivo de ICMS do NCM (`transacao.incentivoIcms`) que vale para o
 * comprador → o % cadastrado, já com o incentivo (substitui base + FCP).
 * Senão → alíquota interna da tabela UF (saleIcmsPercent do cadastro é campo
 * de precificação, não entra aqui).
 */
export function obterAliquotaIcmsSaidaInterna(
  transacao: TransacaoVenda,
  aliquotaInternaTabela: number,
): number {
  if (transacao.hasIcmsSt) {
    return 0;
  }
  const incentivo = transacao.incentivoIcms;
  if (
    incentivo &&
    icmsIncentiveAppliesToBuyer(incentivo, isContribuinteIcms(transacao))
  ) {
    return incentivo.aliquotaPercent / 100;
  }
  return aliquotaInternaTabela;
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
  const internaTabela = aliquotaInternaTotal(ufDestino, rates);
  const isOperacaoInterna = origem === ufDestino;

  if (isOperacaoInterna) {
    const aliquotaSaida = obterAliquotaIcmsSaidaInterna(transacao, internaTabela);
    const icmsTotal = roundMoney(receita * aliquotaSaida);
    const incentivo =
      transacao.incentivoIcms && !transacao.hasIcmsSt
        ? {
            ...transacao.incentivoIcms,
            aplicado: icmsIncentiveAppliesToBuyer(
              transacao.incentivoIcms,
              isContribuinteIcms(transacao),
            ),
          }
        : undefined;
    return {
      ufOrigem: origem,
      ufDestino,
      aliquotaInterestadual: 0,
      aliquotaInternaTotal: internaTabela,
      aliquotaSaidaEfetiva: aliquotaSaida,
      icmsStNaCompra: transacao.hasIcmsSt,
      icmsInterestadual: 0,
      difal: 0,
      icmsTotal,
      isContribuinte: false,
      isOperacaoInterna: true,
      ...(incentivo ? { incentivoIcms: incentivo } : {}),
    };
  }

  const interestadual = obterAliquotaInterestadual({
    ufDestino,
    ufOrigem: origem,
    mercadoriaImportada: transacao.mercadoriaImportada,
  });

  const contribuinte = isContribuinteIcms(transacao);
  const icmsInterestadual = roundMoney(receita * interestadual);

  if (contribuinte) {
    return {
      ufOrigem: origem,
      ufDestino,
      aliquotaInterestadual: interestadual,
      aliquotaInternaTotal: internaTabela,
      icmsInterestadual,
      difal: 0,
      icmsTotal: icmsInterestadual,
      isContribuinte: true,
      isOperacaoInterna: false,
    };
  }

  const difalRate = Math.max(0, internaTabela - interestadual);
  const difal = roundMoney(receita * difalRate);

  return {
    ufOrigem: origem,
    ufDestino,
    aliquotaInterestadual: interestadual,
    aliquotaInternaTotal: internaTabela,
    icmsInterestadual,
    difal,
    icmsTotal: roundMoney(icmsInterestadual + difal),
    isContribuinte: false,
    isOperacaoInterna: false,
  };
}

export function buildIcmsMemoria(result: IcmsDifalBreakdown): string[] {
  if (result.isOperacaoInterna) {
    const tabelaPct = result.aliquotaInternaTotal * 100;
    const lines = [
      `Operação interna ${result.ufOrigem} → ${result.ufDestino}`,
    ];
    const incentivo = result.incentivoIcms;
    if (result.icmsStNaCompra) {
      lines.push("ICMS-ST na compra — ICMS na saída = 0%");
    } else if (incentivo?.aplicado) {
      lines.push(
        `Incentivo fiscal NCM ${formatNcm(incentivo.ncm)}: ${incentivo.aliquotaPercent.toFixed(2)}% (tabela ${result.ufOrigem} ${tabelaPct.toFixed(2)}%)`,
      );
    } else if (incentivo) {
      lines.push(
        `Incentivo do NCM ${formatNcm(incentivo.ncm)} só para contribuinte — comprador não contribuinte, alíquota interna tabela ${tabelaPct.toFixed(2)}%`,
      );
    } else {
      lines.push(`Alíquota interna tabela ${tabelaPct.toFixed(2)}%`);
    }
    lines.push(`ICMS = R$ ${result.icmsTotal.toFixed(2)}`);
    return lines;
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
    lines.push(
      result.difalNaoRecolhido
        ? `DIFAL = R$ ${result.difal.toFixed(2)} — não recolhido (configuração), fora do imposto`
        : `DIFAL = R$ ${result.difal.toFixed(2)}`,
    );
  }

  lines.push(
    result.difalNaoRecolhido
      ? `ICMS devido = R$ ${icmsDevido(result).toFixed(2)}`
      : `ICMS total = R$ ${result.icmsTotal.toFixed(2)}`,
  );
  return lines;
}

/**
 * ICMS que entra no imposto da venda: o total, menos o DIFAL quando a
 * empresa não o recolhe para a UF de destino (`difalNaoRecolhido`). Todo
 * cálculo de imposto operacional passa por aqui — nunca `icmsTotal` direto.
 */
export function icmsDevido(icms: IcmsDifalBreakdown | null | undefined): number {
  if (!icms) return 0;
  return icms.difalNaoRecolhido
    ? roundMoney(icms.icmsTotal - icms.difal)
    : icms.icmsTotal;
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
