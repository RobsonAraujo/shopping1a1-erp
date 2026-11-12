/**
 * Até quando um anúncio continua com desconto, somando a promoção ativa com as
 * **programadas** (`pending`) que emendam nela. Sem isso, "promoção vencendo"
 * acusava anúncio que o vendedor já tinha deixado programado para continuar.
 *
 * Sem dependências (só `Intl`): é importado pelas regras da Rotina, que rodam
 * também em componentes client.
 */

export function getCalendarDateParts(
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
    year: Number(parts.find((p) => p.type === "year")?.value),
    month: Number(parts.find((p) => p.type === "month")?.value),
    day: Number(parts.find((p) => p.type === "day")?.value),
  };
}

export function calendarDayDiff(
  from: Date,
  to: Date,
  timeZone: string,
): number {
  const fromParts = getCalendarDateParts(from, timeZone);
  const toParts = getCalendarDateParts(to, timeZone);
  const fromUtc = Date.UTC(fromParts.year, fromParts.month - 1, fromParts.day);
  const toUtc = Date.UTC(toParts.year, toParts.month - 1, toParts.day);
  return Math.round((toUtc - fromUtc) / (24 * 60 * 60 * 1000));
}

/** O mínimo que o payload de `/seller-promotions/items/{id}` precisa ter. */
export type PromotionRecordLike = {
  type?: string;
  status?: string;
  name?: string;
  start_date?: string;
  finish_date?: string;
};

/**
 * Uma promoção que conta para a cobertura: ativa (`started`) ou programada
 * (`pending`, aprovada e ainda não começou). Convite (`candidate`) não conta:
 * o anúncio ainda não está nela. Datas em ISO para irem direto ao Json.
 */
export type PromotionWindow = {
  status: "started" | "pending";
  name: string | null;
  type: string;
  startsAt: string | null;
  endsAt: string;
};

const STARTED_STATUSES = new Set(["started", "active"]);
const PENDING_STATUSES = new Set(["pending"]);

function isoOrNull(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

export function toPromotionWindows(
  records: PromotionRecordLike[],
): PromotionWindow[] {
  const windows: PromotionWindow[] = [];
  for (const record of records) {
    const status = record.status?.toLowerCase() ?? "";
    const started = STARTED_STATUSES.has(status);
    const pending = PENDING_STATUSES.has(status);
    if (!started && !pending) continue;
    const endsAt = isoOrNull(record.finish_date);
    if (!endsAt) continue;
    const startsAt = isoOrNull(record.start_date);
    // Programada sem início lido: não dá para saber se emenda.
    if (pending && !startsAt) continue;
    windows.push({
      status: started ? "started" : "pending",
      name: record.name?.trim() ? record.name.trim() : null,
      type: record.type ?? "UNKNOWN",
      startsAt,
      endsAt,
    });
  }
  return windows;
}

export type PromotionCoverage = {
  /** Até quando o anúncio tem desconto sem interrupção. `null` = sem ativa. */
  coveredUntil: string | null;
  /** Programadas que emendam e esticam a cobertura, em ordem. */
  extendedBy: PromotionWindow[];
  /** A primeira programada que começa depois de um buraco. */
  nextAfterGap: { window: PromotionWindow; daysWithout: number } | null;
};

/**
 * "Emenda" = a programada começa até o dia seguinte ao fim da cobertura, no
 * dia civil do fuso (acaba dia 15 às 23:59, começa dia 16 às 00:00 → emenda).
 */
const MAX_START_DAY_GAP = 1;

export function promotionCoverage(
  windows: PromotionWindow[],
  timeZone: string,
): PromotionCoverage {
  const started = windows.filter((w) => w.status === "started");
  if (started.length === 0) {
    return { coveredUntil: null, extendedBy: [], nextAfterGap: null };
  }

  let end = new Date(
    Math.max(...started.map((w) => new Date(w.endsAt).getTime())),
  );
  const extendedBy: PromotionWindow[] = [];
  let nextAfterGap: PromotionCoverage["nextAfterGap"] = null;

  const pending = windows
    .filter((w) => w.status === "pending" && w.startsAt)
    .sort(
      (a, b) =>
        new Date(a.startsAt as string).getTime() -
        new Date(b.startsAt as string).getTime(),
    );

  for (const window of pending) {
    const windowEnd = new Date(window.endsAt);
    if (windowEnd.getTime() <= end.getTime()) continue;
    const gap = calendarDayDiff(end, new Date(window.startsAt as string), timeZone);
    if (gap <= MAX_START_DAY_GAP) {
      end = windowEnd;
      extendedBy.push(window);
      continue;
    }
    nextAfterGap = { window, daysWithout: gap - 1 };
    break;
  }

  return { coveredUntil: end.toISOString(), extendedBy, nextAfterGap };
}
