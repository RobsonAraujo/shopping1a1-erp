import {
  currentMonthYmdRange,
  lastDaysYmdRange,
  ymdFromLocalDate,
  yesterdayYmdRange,
} from "@/lib/date-range";

/**
 * Visões da Lucratividade. Todas são períodos de vendas reais (média
 * ponderada pelo faturamento), exceto `simulation`: todos os anúncios no
 * preço de hoje, peso igual — "o caminho da margem", não o resultado.
 */
export type LucratividadeView =
  | "today"
  | "yesterday"
  | "last7"
  | "currentMonth"
  | "last60"
  | "last90"
  | "custom"
  | "simulation";

export type LucratividadePeriodPreset = Exclude<
  LucratividadeView,
  "custom" | "simulation"
>;

export const DEFAULT_LUCRATIVIDADE_VIEW: LucratividadePeriodPreset = "last7";

/** Período personalizado máximo — igual ao maior chip e à janela da API de ADS. */
export const LUCRATIVIDADE_MAX_CUSTOM_DAYS = 90;

export const LUCRATIVIDADE_PERIOD_PRESETS: Array<{
  id: LucratividadePeriodPreset;
  label: string;
}> = [
  { id: "today", label: "Hoje" },
  { id: "yesterday", label: "Ontem" },
  { id: "last7", label: "7 dias" },
  { id: "currentMonth", label: "Mês atual" },
  { id: "last60", label: "60 dias" },
  { id: "last90", label: "90 dias" },
];

export function resolvePeriodPreset(
  preset: LucratividadePeriodPreset,
  now: Date = new Date(),
): { from: string; to: string } {
  switch (preset) {
    case "today": {
      const ymd = ymdFromLocalDate(now);
      return { from: ymd, to: ymd };
    }
    case "yesterday":
      return yesterdayYmdRange(now);
    case "last7":
      return lastDaysYmdRange(7, now);
    case "currentMonth":
      return currentMonthYmdRange(now);
    case "last60":
      return lastDaysYmdRange(60, now);
    case "last90":
      return lastDaysYmdRange(90, now);
  }
}

/** "06/10" ou "01/10 – 06/10" (ano só quando cruza anos). */
export function formatYmdRangeShort(from: string, to: string): string {
  const [fy, fm, fd] = from.split("-");
  const [ty, tm, td] = to.split("-");
  const withYear = fy !== ty;
  const fmt = (y: string, m: string, d: string) =>
    withYear ? `${d}/${m}/${y}` : `${d}/${m}`;
  if (from === to) return fmt(fy, fm, fd);
  return `${fmt(fy, fm, fd)} – ${fmt(ty, tm, td)}`;
}
