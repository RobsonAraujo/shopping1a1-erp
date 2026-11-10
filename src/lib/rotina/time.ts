/**
 * "Hoje" da Rotina é o dia civil no fuso da organização (São Paulo), não o dia
 * UTC: uma ação que apareceu às 22h de segunda não pode virar "de ontem" às 21h.
 * Tudo recebe `now` de fora para os testes não dependerem do relógio.
 *
 * Sem dependências (só `Intl`): é importado por componentes client via
 * `format.ts`.
 */

function getCalendarDateParts(
  date: Date,
  timeZone: string,
): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
}

function calendarDayDiff(from: Date, to: Date, timeZone: string): number {
  const a = getCalendarDateParts(from, timeZone);
  const b = getCalendarDateParts(to, timeZone);
  const fromUtc = Date.UTC(a.year, a.month - 1, a.day);
  const toUtc = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((toUtc - fromUtc) / (24 * 60 * 60 * 1000));
}

/** Diferença local (`fuso` local − UTC) em ms no instante dado. */
function zonedOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Instante exato da meia-noite local do dia de `date`. */
export function startOfLocalDay(date: Date, timeZone: string): Date {
  const { year, month, day } = getCalendarDateParts(date, timeZone);
  const guess = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  const offset = zonedOffsetMs(new Date(guess), timeZone);
  let result = guess - offset;
  // Virada de horário de verão entre o palpite e o resultado: refaz com o
  // offset do próprio resultado.
  const offsetAtResult = zonedOffsetMs(new Date(result), timeZone);
  if (offsetAtResult !== offset) result = guess - offsetAtResult;
  return new Date(result);
}

/** Meia-noite local de `days` dias depois do dia de `date`. */
export function startOfLocalDayPlus(
  date: Date,
  days: number,
  timeZone: string,
): Date {
  const { year, month, day } = getCalendarDateParts(date, timeZone);
  // Meio-dia UTC do dia alvo: longe de qualquer borda de fuso.
  const target = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0, 0));
  return startOfLocalDay(target, timeZone);
}

/** Dias civis de `from` até `to` (0 = mesmo dia, 1 = `to` é amanhã). */
export function localDayDiff(from: Date, to: Date, timeZone: string): number {
  return calendarDayDiff(from, to, timeZone);
}

export function isSameLocalDay(a: Date, b: Date, timeZone: string): boolean {
  return calendarDayDiff(a, b, timeZone) === 0;
}

export function isoIsToday(
  iso: string | null | undefined,
  now: Date,
  timeZone: string,
): boolean {
  if (!iso) return false;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return false;
  return isSameLocalDay(date, now, timeZone);
}
