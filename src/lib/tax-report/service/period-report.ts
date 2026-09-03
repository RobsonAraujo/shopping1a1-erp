import { monthsInRange } from "@/lib/date-range";
import { agregarPorSku, consolidarRelatorio } from "@/lib/tax-report/aggregation/agregador-por-sku";
import { collectDetalhes } from "@/lib/tax-report/repair-snapshot-apuracao";
import { loadTaxReportSnapshot } from "@/lib/tax-report/service/generate-monthly-report";
import type { DetalhamentoTributario, TaxReportPayload } from "@/lib/tax-report/types";

export type PeriodReportResult = {
  payload: TaxReportPayload;
  missingMonths: { year: number; month: number }[];
};

export type MonthSnapshotEntry = {
  month: { year: number; month: number };
  payload: TaxReportPayload | null;
};

function isWithinRange(det: DetalhamentoTributario, fromYmd: string, toYmd: string): boolean {
  const orderYmd = det.transacao.orderDate.slice(0, 10);
  return orderYmd >= fromYmd && orderYmd <= toYmd;
}

/** Pura: combina snapshots já carregados (1 ou mais meses) num único TaxReportPayload filtrado por dia. */
export function buildPeriodReportPayload(
  snapshots: MonthSnapshotEntry[],
  fromYmd: string,
  toYmd: string,
): PeriodReportResult {
  const missingMonths = snapshots
    .filter((s) => s.payload === null)
    .map((s) => s.month);

  const payloads = snapshots
    .map((s) => s.payload)
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const detalhes = payloads
    .flatMap((payload) => collectDetalhes(payload))
    .filter((det) => isWithinRange(det, fromYmd, toYmd));

  const porSku = agregarPorSku(detalhes);
  const consolidado = consolidarRelatorio(detalhes);

  const overrides = Object.assign({}, ...payloads.map((p) => p.overrides));

  const orderIds = new Set(detalhes.map((d) => d.transacao.orderId));
  const semBillingInfo = detalhes.filter(
    (d) => d.transacao.dadosFiscaisIndisponiveis,
  ).length;

  const geradoEm = payloads.reduce<string | null>((latest, p) => {
    if (!latest || p.meta.geradoEm > latest) return p.meta.geradoEm;
    return latest;
  }, null);

  const last = snapshots[snapshots.length - 1].month;

  const payload: TaxReportPayload = {
    year: last.year,
    month: last.month,
    periodFrom: fromYmd,
    periodTo: toYmd,
    consolidado,
    porSku,
    overrides,
    meta: {
      geradoEm: geradoEm ?? new Date().toISOString(),
      pedidosProcessados: orderIds.size,
      linhasProcessadas: detalhes.length,
      semBillingInfo,
      duracaoMs: 0,
      taxRegime: payloads[0]?.meta.taxRegime ?? "",
      originUf: payloads[0]?.meta.originUf ?? "",
    },
  };

  return { payload, missingMonths };
}

export async function loadTaxReportForPeriod(
  organizationId: string,
  sellerId: number,
  fromYmd: string,
  toYmd: string,
): Promise<PeriodReportResult> {
  const months = monthsInRange(fromYmd, toYmd);

  const snapshots = await Promise.all(
    months.map((m) =>
      loadTaxReportSnapshot(sellerId, m.year, m.month).then((payload) => ({
        month: m,
        payload,
      })),
    ),
  );

  return buildPeriodReportPayload(snapshots, fromYmd, toYmd);
}
