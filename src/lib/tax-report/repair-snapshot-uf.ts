import { roundMoney } from "@/lib/financial-margin";
import { resolveUfDestino } from "@/lib/tax-report/brazilian-ufs";
import { icmsSemDifal } from "@/lib/tax-report/calculators/icms-difal";
import type { TaxReportPayload } from "@/lib/tax-report/types";

function repairConsolidadoIcmsSplit(
  payload: TaxReportPayload,
): TaxReportPayload {
  const { consolidado } = payload;
  if (
    consolidado.icmsSemDifalTotal != null &&
    consolidado.difalTotal != null
  ) {
    return payload;
  }

  const incluidas = payload.porSku.flatMap((sku) =>
    sku.transacoes.filter((row) => row.incluidoNaApuracao),
  );
  if (incluidas.length === 0) return payload;

  const icmsSemDifalTotal = roundMoney(
    incluidas.reduce((sum, row) => sum + icmsSemDifal(row.icmsDifal), 0),
  );
  const difalTotal = roundMoney(
    incluidas.reduce((sum, row) => sum + (row.icmsDifal?.difal ?? 0), 0),
  );

  return {
    ...payload,
    consolidado: {
      ...consolidado,
      icmsSemDifalTotal,
      difalTotal,
    },
  };
}

/** Corrige UFs inválidas e split ICMS/DIFAL em snapshots antigos (síncrono). */
export function repairTaxReportPayloadSync(
  payload: TaxReportPayload,
): TaxReportPayload {
  let changed = false;

  const rootTransacoes = payload.transacoes ?? [];
  const transacoes =
    rootTransacoes.length > 0
      ? rootTransacoes.map((row) => {
          const fixed = resolveUfDestino(row.transacao.ufDestino);
          if (fixed === row.transacao.ufDestino) return row;
          changed = true;
          return {
            ...row,
            transacao: {
              ...row.transacao,
              ufDestino: fixed,
            },
          };
        })
      : rootTransacoes;

  const porSku = payload.porSku.map((skuRow) => {
    const skuTransacoes = skuRow.transacoes.map((row) => {
      const fixed = resolveUfDestino(row.transacao.ufDestino);
      if (fixed === row.transacao.ufDestino) return row;
      changed = true;
      return {
        ...row,
        transacao: {
          ...row.transacao,
          ufDestino: fixed,
        },
      };
    });
    if (skuTransacoes === skuRow.transacoes) return skuRow;
    return { ...skuRow, transacoes: skuTransacoes };
  });

  const withUf = changed ? { ...payload, transacoes, porSku } : payload;
  return repairConsolidadoIcmsSplit(withUf);
}

/** @deprecated Use repairTaxReportPayload from repair-snapshot-apuracao (async). */
export const repairTaxReportPayload = repairTaxReportPayloadSync;
