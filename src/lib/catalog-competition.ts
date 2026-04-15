export type CompetitionStatus = "winning" | "losing" | "shared" | "unknown";

export type CompetitionPoint = {
  at: Date;
  status: CompetitionStatus;
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

export function extractPriceToWin(payload: Record<string, unknown>): number | null {
  const candidates = [
    payload.price_to_win,
    payload.priceToWin,
    payload.target_price,
    payload.price,
  ];
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c)) return c;
    if (typeof c === "string") {
      const n = Number(c.replace(",", "."));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
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
      source: curr.source,
    });
  }

  return { intervals, totals };
}

