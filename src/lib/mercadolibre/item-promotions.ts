import { getMercadoLibreConfig } from "./config";

export type ItemPromotionRecord = {
  id?: string;
  type?: string;
  status?: string;
  name?: string;
  price?: number;
  original_price?: number;
  start_date?: string;
  finish_date?: string;
};

export type ActiveItemPromotion = {
  type: string;
  name: string | null;
  price: number | null;
  originalPrice: number | null;
  finishDate: Date;
};

const ACTIVE_PROMOTION_STATUSES = new Set(["started", "active"]);

export function isActivePromotionStatus(status: string | undefined): boolean {
  if (!status) return false;
  return ACTIVE_PROMOTION_STATUSES.has(status.toLowerCase());
}

export function parsePromotionFinishDate(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

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

/** Início do dia local no timezone informado. */
export function startOfDayInTimeZone(date: Date, timeZone: string): Date {
  const { year, month, day } = getCalendarDateParts(date, timeZone);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
}

/** Fim do dia local no timezone informado (23:59:59.999). */
export function endOfDayInTimeZone(date: Date, timeZone: string): Date {
  const start = startOfDayInTimeZone(date, timeZone);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

export function daysUntilPromotionEnd(
  finishDate: Date,
  now: Date,
  timeZone: string,
): number {
  return calendarDayDiff(now, finishDate, timeZone);
}

export function isPromotionExpiringWithinDays(
  finishDate: Date,
  now: Date,
  days: number,
  timeZone: string,
): boolean {
  const remaining = daysUntilPromotionEnd(finishDate, now, timeZone);
  return remaining >= 0 && remaining <= days;
}

export function pickEarliestActivePromotion(
  promotions: ItemPromotionRecord[],
): ActiveItemPromotion | null {
  const active = promotions
    .filter((promo) => isActivePromotionStatus(promo.status))
    .map((promo) => {
      const finishDate = parsePromotionFinishDate(promo.finish_date);
      if (!finishDate) return null;
      return {
        type: promo.type ?? "UNKNOWN",
        name: promo.name?.trim() ? promo.name.trim() : null,
        price:
          promo.price !== undefined && Number.isFinite(Number(promo.price))
            ? Number(promo.price)
            : null,
        originalPrice:
          promo.original_price !== undefined &&
          Number.isFinite(Number(promo.original_price))
            ? Number(promo.original_price)
            : null,
        finishDate,
      } satisfies ActiveItemPromotion;
    })
    .filter((promo): promo is ActiveItemPromotion => promo !== null);

  if (active.length === 0) return null;

  active.sort((a, b) => a.finishDate.getTime() - b.finishDate.getTime());
  return active[0] ?? null;
}

function normalizePromotionsPayload(data: unknown): ItemPromotionRecord[] {
  if (Array.isArray(data)) {
    return data as ItemPromotionRecord[];
  }
  if (
    data &&
    typeof data === "object" &&
    Array.isArray((data as { results?: unknown }).results)
  ) {
    return (data as { results: ItemPromotionRecord[] }).results;
  }
  if (data && typeof data === "object") {
    return [data as ItemPromotionRecord];
  }
  return [];
}

export async function fetchItemPromotions(
  accessToken: string,
  itemId: string,
): Promise<ItemPromotionRecord[]> {
  const { apiBase } = getMercadoLibreConfig();
  const u = new URL(`${apiBase}/seller-promotions/items/${itemId}`);
  u.searchParams.set("app_version", "v2");

  const res = await fetch(u.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (res.status === 404) {
    return [];
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `seller-promotions/items/${itemId} failed: ${res.status} ${text}`,
    );
  }

  const data: unknown = await res.json();
  return normalizePromotionsPayload(data);
}
