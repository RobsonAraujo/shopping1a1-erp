import { reportsConfig } from "@/config/reports";
import { getZonedParts } from "@/lib/report-timezone";

export type CompetitionStatus = "winning" | "losing" | "shared" | "unknown";

export type LatestCatalogSnapshot = {
  status: CompetitionStatus;
  sellerPrice: number | null;
  priceToWin: number | null;
  snapshotAt: Date;
};

const PRICE_EPSILON = 0.001;

export function dayKeyInTimezone(
  date: Date,
  timeZone: string = reportsConfig.catalogCompetitionTimezone,
): string {
  const parts = getZonedParts(date, timeZone);
  const y = String(parts.year);
  const m = String(parts.month).padStart(2, "0");
  const d = String(parts.day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function catalogPricesEqual(
  a: number | null,
  b: number | null,
): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return Math.abs(a - b) < PRICE_EPSILON;
}

export function catalogPricesChanged(
  latest: LatestCatalogSnapshot,
  sellerPrice: number | null,
  priceToWin: number | null,
): boolean {
  return (
    !catalogPricesEqual(latest.sellerPrice, sellerPrice) ||
    !catalogPricesEqual(latest.priceToWin, priceToWin)
  );
}

export function shouldRecordCatalogSnapshot(params: {
  latest: LatestCatalogSnapshot | null;
  polledAt: Date;
  status: CompetitionStatus;
  sellerPrice: number | null;
  priceToWin: number | null;
  timeZone?: string;
}): boolean {
  const timeZone = params.timeZone ?? reportsConfig.catalogCompetitionTimezone;
  const { latest, polledAt, status, sellerPrice, priceToWin } = params;

  if (!latest) return true;
  if (latest.status !== status) return true;
  if (
    dayKeyInTimezone(latest.snapshotAt, timeZone) !==
    dayKeyInTimezone(polledAt, timeZone)
  ) {
    return true;
  }
  return catalogPricesChanged(latest, sellerPrice, priceToWin);
}

export type CompetitionPoint = {
  at: Date;
  status: CompetitionStatus;
  sellerPrice: number | null;
  priceToWin: number | null;
  source: "event" | "snapshot";
};

export function normalizeCompetitionStatus(value: unknown): CompetitionStatus {
  if (typeof value !== "string") return "unknown";
  const v = value.trim().toLowerCase();

  if (v === "winning") return "winning";
  if (v === "competing" || v === "losing") return "losing";
  if (v === "sharing_first_place" || v === "shared") return "shared";

  // Backward-compatible fallback for payload variations.
  if (v.includes("sharing") || v.includes("share")) return "shared";
  if (v.includes("competing") || v.includes("lose") || v.includes("losing")) {
    return "losing";
  }
  if (v.includes("win")) return "winning";

  return "unknown";
}

export function deriveStatusFromPriceToWin(payload: Record<string, unknown>): CompetitionStatus {
  const explicit = normalizeCompetitionStatus(payload.status);
  if (explicit !== "unknown") return explicit;

  // Common fallback keys from marketplace payloads.
  const fallbackKeys = [
    "competition_status",
    "item_competition_status",
    "winning_status",
    "condition",
  ];
  for (const key of fallbackKeys) {
    const n = normalizeCompetitionStatus(payload[key]);
    if (n !== "unknown") return n;
  }

  const visitShare = payload.visit_share;
  if (typeof visitShare === "string") {
    const v = visitShare.trim().toLowerCase();
    if (v === "maximum") return "winning";
    if (v === "minimum") return "losing";
    if (v === "medium") return "shared";
  }

  return "unknown";
}

export function parseMoneyValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  if (typeof value === "object" && value !== null) {
    const amount = (value as { amount?: unknown }).amount;
    if (amount !== undefined) return parseMoneyValue(amount);
  }
  return null;
}

export function extractPriceToWin(payload: Record<string, unknown>): number | null {
  const candidates = [
    payload.price_to_win,
    payload.priceToWin,
    payload.target_price,
    payload.price,
  ];
  for (const c of candidates) {
    const parsed = parseMoneyValue(c);
    if (parsed !== null) return parsed;
  }
  return null;
}

export function extractSellerPrice(
  pricePayload?: Record<string, unknown> | null,
  item?: { price?: unknown } | null,
): number | null {
  if (pricePayload) {
    const fromPayload = parseMoneyValue(
      pricePayload.current_price ??
        pricePayload.currentPrice ??
        pricePayload.item_price,
    );
    if (fromPayload !== null) return fromPayload;
  }
  if (item) {
    const fromItem = parseMoneyValue(item.price);
    if (fromItem !== null) return fromItem;
  }
  return null;
}

export function decimalToNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function extractSellerPriceFromRawResponse(
  rawResponse: unknown,
  storedSellerPrice: unknown,
): number | null {
  const stored = decimalToNumber(storedSellerPrice);
  if (stored !== null) return stored;
  if (!rawResponse || typeof rawResponse !== "object") return null;

  const raw = rawResponse as Record<string, unknown>;
  const pricePayload =
    raw.priceToWin && typeof raw.priceToWin === "object"
      ? (raw.priceToWin as Record<string, unknown>)
      : null;
  const item =
    raw.item && typeof raw.item === "object"
      ? (raw.item as { price?: unknown })
      : null;

  return extractSellerPrice(pricePayload, item);
}

export function buildTimeline(
  points: CompetitionPoint[],
  from: Date,
  to: Date,
) {
  const ordered = [...points]
    .filter((p) => p.at.getTime() >= from.getTime() && p.at.getTime() <= to.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  const intervals: Array<{
    from: string;
    to: string;
    status: CompetitionStatus;
    minutes: number;
    sellerPrice: number | null;
    priceToWin: number | null;
    source: "event" | "snapshot";
  }> = [];
  const totals: Record<CompetitionStatus, number> = {
    winning: 0,
    losing: 0,
    shared: 0,
    unknown: 0,
  };

  if (ordered.length === 0) return { intervals, totals };

  for (let i = 0; i < ordered.length; i += 1) {
    const curr = ordered[i];
    const next = ordered[i + 1];
    const start = curr.at;
    const end = next?.at ?? to;
    const minutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
    totals[curr.status] += minutes;
    intervals.push({
      from: start.toISOString(),
      to: end.toISOString(),
      status: curr.status,
      minutes,
      sellerPrice: curr.sellerPrice,
      priceToWin: curr.priceToWin,
      source: curr.source,
    });
  }

  return { intervals, totals };
}

export function formatCatalogMoney(value: number | null): string | null {
  if (value === null) return null;
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function catalogStatusLabel(status: CompetitionStatus): string {
  if (status === "winning") return "Ganhando";
  if (status === "losing") return "Perdendo";
  if (status === "shared") return "Compartilhando";
  return "Sem sinal";
}

export function catalogStatusBadgeClass(status: string | null): string {
  if (status === "winning") {
    return "inline-flex rounded-md bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white";
  }
  if (status === "losing") {
    return "inline-flex rounded-md bg-rose-600 px-2 py-0.5 text-xs font-semibold text-white";
  }
  if (status === "shared") {
    return "inline-flex rounded-md bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white";
  }
  return "inline-flex rounded-md bg-[var(--muted)] px-2 py-0.5 text-xs font-semibold text-[var(--muted-foreground)]";
}

export function catalogPriceGap(
  sellerPrice: number | null,
  priceToWin: number | null,
): number | null {
  if (sellerPrice == null || priceToWin == null) return null;
  return Math.round((sellerPrice - priceToWin) * 100) / 100;
}

