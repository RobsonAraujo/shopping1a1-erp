import { getCivilMonthClose } from "@/lib/mercadolibre/revenue-periods";

/**
 * - `partial`: o mês ainda não terminou — o relatório é parcial por natureza
 *   (só informativo, não pede ação);
 * - `incomplete`: o mês já fechou, mas os pedidos foram buscados **antes** do
 *   fechamento (ex.: atualizado em 10/09 para setembro) — faltam vendas;
 * - `closed`: pedidos buscados depois do fechamento — o relatório cobre o mês.
 */
export type TaxReportCompleteness = "partial" | "incomplete" | "closed";

/** Motivos que pedem recalcular o relatório (todos geram alerta). */
export type TaxReportStalenessReason =
  /** Mês fechado com pedidos buscados antes do fechamento → recálculo completo. */
  | "incomplete"
  /** Nivelamento do mês alterado depois do cálculo → recálculo rápido. */
  | "leveling"
  /** Versão antiga do cálculo (sem identidade do anúncio) → recálculo rápido. */
  | "legacy";

export type TaxReportStalenessInput = {
  year: number;
  month: number;
  /**
   * Quando os pedidos foram buscados no ML (`meta.pedidosBuscadosEm`, ou
   * `meta.geradoEm` em relatórios antigos). Nunca a versão do relatório: o
   * recálculo rápido muda a versão sem buscar pedido nenhum.
   */
  ordersFetchedAt: string | Date | null;
  /** Versão do relatório (`generatedAt`). */
  generatedAt: string | Date | null;
  legacy?: boolean;
  /** Último `updatedAt` dos nivelamentos que cobrem o mês. */
  levelingUpdatedAt?: string | Date | null;
  now?: Date;
};

export type TaxReportStaleness = {
  completeness: TaxReportCompleteness;
  reasons: TaxReportStalenessReason[];
  /** Primeiro instante do mês seguinte (fuso de SP). */
  monthCloseIso: string;
  ordersFetchedAtIso: string | null;
};

function toTime(value: string | Date | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

export function taxReportStaleness(
  input: TaxReportStalenessInput,
): TaxReportStaleness {
  const now = input.now ?? new Date();
  const close = getCivilMonthClose(input.year, input.month);
  const fetchedAt = toTime(input.ordersFetchedAt);
  const generatedAt = toTime(input.generatedAt);

  let completeness: TaxReportCompleteness;
  if (now.getTime() < close.getTime()) {
    completeness = "partial";
  } else if (fetchedAt !== null && fetchedAt >= close.getTime()) {
    completeness = "closed";
  } else {
    completeness = "incomplete";
  }

  const reasons: TaxReportStalenessReason[] = [];
  if (completeness === "incomplete") reasons.push("incomplete");
  const levelingAt = toTime(input.levelingUpdatedAt);
  if (levelingAt !== null && (generatedAt === null || levelingAt > generatedAt)) {
    reasons.push("leveling");
  }
  if (input.legacy) reasons.push("legacy");

  return {
    completeness,
    reasons,
    monthCloseIso: close.toISOString(),
    ordersFetchedAtIso: fetchedAt === null ? null : new Date(fetchedAt).toISOString(),
  };
}

/** Só a busca de pedidos resolve um mês incompleto; o resto se resolve sem ML. */
export function taxReportNeedsFullRecalc(
  reasons: readonly TaxReportStalenessReason[],
): boolean {
  return reasons.includes("incomplete");
}
