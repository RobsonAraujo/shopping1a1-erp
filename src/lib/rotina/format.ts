import { formatMoneyBRL } from "@/lib/format-money";
import { localDayDiff } from "@/lib/rotina/time";

/** Formatação de texto da Rotina — pt-BR, frases curtas. */

export function formatMoney(value: number): string {
  return formatMoneyBRL(value);
}

export function formatPercent(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })}%`;
}

export function formatUnitsPerDay(value: number | null): string {
  if (value === null) return "vendas sem leitura";
  if (value <= 0) return "sem vendas recentes";
  return `vende ${value.toLocaleString("pt-BR", {
    maximumFractionDigits: value < 10 ? 1 : 0,
  })}/dia`;
}

/** "2,3/dia", "0/dia", "—" — taxa curta, para comparar dois anúncios lado a lado. */
export function formatUnitsRate(value: number | null): string {
  if (value === null) return "—";
  return `${value.toLocaleString("pt-BR", {
    maximumFractionDigits: value < 10 ? 1 : 0,
  })}/dia`;
}

/** "hoje", "amanhã", "em 3 dias" — prazo até uma data. */
export function formatDaysUntil(days: number): string {
  if (days <= 0) return "hoje";
  if (days === 1) return "amanhã";
  return `em ${days} dias`;
}

export function formatShortDate(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
  });
}

export function formatClock(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return minute === "00" ? `${hour}h` : `${hour}h${minute}`;
}

/** "desde hoje às 14h05", "desde ontem", "há 3 dias", "há mais de 30 dias". */
export function formatSince(
  iso: string | null,
  now: Date,
  timeZone: string,
  truncatedDays?: number,
): string | null {
  if (!iso) return null;
  if (truncatedDays !== undefined) return `há mais de ${truncatedDays} dias`;
  const days = localDayDiff(new Date(iso), now, timeZone);
  if (days <= 0) return `desde hoje às ${formatClock(iso, timeZone)}`;
  if (days === 1) return "desde ontem";
  return `há ${days} dias`;
}

/** "terça-feira, 10 de novembro". */
export function formatTodayLabel(now: Date, timeZone: string): string {
  return now.toLocaleDateString("pt-BR", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** "hoje às 06h02", "ontem às 18h40", "08/11 às 09h". */
export function formatWhen(iso: string, now: Date, timeZone: string): string {
  const days = localDayDiff(new Date(iso), now, timeZone);
  const clock = formatClock(iso, timeZone);
  if (days <= 0) return `hoje às ${clock}`;
  if (days === 1) return `ontem às ${clock}`;
  return `${formatShortDate(iso, timeZone)} às ${clock}`;
}
