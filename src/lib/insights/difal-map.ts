import type { TaxReportPayload } from "@/lib/tax-report/types";
import type { DifalMapRow } from "./types";

export function buildDifalMap(payload: TaxReportPayload): DifalMapRow[] {
  const byUf = new Map<
    string,
    { receita: number; unidades: number; margemSoma: number; count: number }
  >();

  for (const sku of payload.porSku) {
    for (const det of sku.transacoes) {
      if (!det.incluidoNaApuracao) continue;
      const uf = det.transacao.ufDestino;
      if (!uf) continue;
      const entry = byUf.get(uf) ?? { receita: 0, unidades: 0, margemSoma: 0, count: 0 };
      entry.receita += det.transacao.receitaBruta;
      entry.unidades += det.transacao.quantidade;
      entry.margemSoma += det.margemOperacionalEstimada;
      entry.count += 1;
      byUf.set(uf, entry);
    }
  }

  return Array.from(byUf.entries())
    .map(([uf, data]) => ({
      uf,
      receitaTotal: data.receita,
      unidades: data.unidades,
      // margemMedia = margem % média ponderada pela receita do período
      margemMedia: data.receita > 0 ? (data.margemSoma / data.receita) * 100 : 0,
      totalTransacoes: data.count,
    }))
    .sort((a, b) => b.receitaTotal - a.receitaTotal);
}
