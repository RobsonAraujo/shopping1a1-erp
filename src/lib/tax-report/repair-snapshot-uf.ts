import { resolveUfDestino } from "@/lib/tax-report/brazilian-ufs";
import type { TaxReportPayload } from "@/lib/tax-report/types";

/** Corrige UFs inválidas em snapshots gerados antes do fix de parse do ML. */
export function repairTaxReportPayload(payload: TaxReportPayload): TaxReportPayload {
  let changed = false;

  const transacoes = payload.transacoes.map((row) => {
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

  if (!changed) return payload;
  return { ...payload, transacoes, porSku };
}
