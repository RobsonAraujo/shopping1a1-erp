import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { reportsConfig } from "@/config/reports";
import { prisma } from "@/lib/db";
import { buildTimeline, type CompetitionPoint } from "@/lib/catalog-competition";
import { getValidAccessToken } from "@/lib/mercadolibre/session";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";

type RouteContext = { params: Promise<{ itemId: string }> };
const STATUS_CARRY_MAX_MS = 6 * 60 * 60 * 1000;

function parseDateParam(v: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseDateOnlyParamInTz(
  value: string | null,
  timeZone: string,
  endOfDay: boolean,
): Date | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const dayStartMs = getDayStartMsInTz(probe, timeZone);
  if (!endOfDay) {
    return new Date(dayStartMs);
  }

  const nextDayStartMs = getNextDayStartMsInTz(new Date(dayStartMs), timeZone);
  return new Date(nextDayStartMs - 1000);
}

function formatInTz(d: Date, timeZone: string) {
  const date = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  }).format(d);
  const time = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);
  const dayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return { date, time, dayKey };
}

function getTimeZoneOffsetMs(d: Date, timeZone: string): number {
  const tzNamePart = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
  })
    .formatToParts(d)
    .find((part) => part.type === "timeZoneName")?.value;
  if (!tzNamePart) return 0;
  if (tzNamePart === "GMT" || tzNamePart === "UTC") return 0;

  const match = tzNamePart.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) return 0;

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? "0");
  return sign * (hours * 60 + minutes) * 60 * 1000;
}

function getDayStartMsInTz(d: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  const year = Number(parts.find((part) => part.type === "year")?.value ?? "0");
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "1");
  const day = Number(parts.find((part) => part.type === "day")?.value ?? "1");
  const utcMidnightMs = Date.UTC(year, month - 1, day, 0, 0, 0);
  const offsetMs = getTimeZoneOffsetMs(new Date(utcMidnightMs), timeZone);
  return utcMidnightMs - offsetMs;
}

function getNextDayStartMsInTz(d: Date, timeZone: string): number {
  const startMs = getDayStartMsInTz(d, timeZone);
  const tomorrowProbe = new Date(startMs + 36 * 60 * 60 * 1000);
  return getDayStartMsInTz(tomorrowProbe, timeZone);
}

function splitIntervalByDay(
  fromDate: Date,
  toDate: Date,
  timeZone: string,
): Array<{ from: Date; to: Date; minutes: number }> {
  const segments: Array<{ from: Date; to: Date; minutes: number }> = [];
  let cursorMs = fromDate.getTime();
  const endMs = toDate.getTime();

  while (cursorMs < endMs) {
    const nextDayStartMs = getNextDayStartMsInTz(new Date(cursorMs), timeZone);
    const segmentEndMs = Math.min(endMs, nextDayStartMs);
    if (segmentEndMs <= cursorMs) break;

    const minutes = Math.max(0, Math.round((segmentEndMs - cursorMs) / 60000));
    segments.push({
      from: new Date(cursorMs),
      to: new Date(segmentEndMs),
      minutes,
    });
    cursorMs = segmentEndMs;
  }

  return segments;
}

function applyCarryWindow(
  points: CompetitionPoint[],
  maxCarryMs: number,
): CompetitionPoint[] {
  if (points.length <= 1) return points;

  const ordered = [...points].sort((a, b) => a.at.getTime() - b.at.getTime());
  const bounded: CompetitionPoint[] = [];

  for (let i = 0; i < ordered.length; i += 1) {
    const curr = ordered[i];
    const next = ordered[i + 1];
    bounded.push(curr);

    if (!next) continue;
    const gapMs = next.at.getTime() - curr.at.getTime();
    if (gapMs > maxCarryMs) {
      bounded.push({
        at: new Date(curr.at.getTime() + maxCarryMs),
        status: "unknown",
        source: curr.source,
      });
    }
  }

  return bounded.sort((a, b) => a.at.getTime() - b.at.getTime());
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { itemId } = await context.params;
  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tz = request.nextUrl.searchParams.get("tz") ?? reportsConfig.catalogCompetitionTimezone;
  const fromDateOnly = parseDateOnlyParamInTz(
    request.nextUrl.searchParams.get("fromDate"),
    tz,
    false,
  );
  const toDateOnly = parseDateOnlyParamInTz(
    request.nextUrl.searchParams.get("toDate"),
    tz,
    true,
  );
  const to = toDateOnly ?? parseDateParam(request.nextUrl.searchParams.get("to")) ?? new Date();
  const from =
    fromDateOnly ??
    parseDateParam(request.nextUrl.searchParams.get("from")) ??
    new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (from.getTime() >= to.getTime()) {
    return NextResponse.json({ error: "invalid_range" }, { status: 400 });
  }

  try {
    const listing = await prisma.listing.findUnique({
      where: { mlItemId: itemId },
      select: {
        mlItemId: true,
        titleSnapshot: true,
        skuSnapshot: true,
        imageUrlSnapshot: true,
        catalogListing: true,
      },
    });
    if (!listing || listing.catalogListing !== true) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const [baseline, snapshots] = await Promise.all([
      prisma.catalogCompetitionSnapshot.findFirst({
        where: { mlItemId: itemId, snapshotAt: { lt: from } },
        select: { snapshotAt: true, status: true },
        orderBy: { snapshotAt: "desc" },
      }),
      prisma.catalogCompetitionSnapshot.findMany({
        where: { mlItemId: itemId, snapshotAt: { gte: from, lte: to } },
        select: { snapshotAt: true, status: true },
        orderBy: { snapshotAt: "asc" },
      }),
    ]);

    const points: CompetitionPoint[] = [];
    if (
      baseline &&
      from.getTime() - baseline.snapshotAt.getTime() <= STATUS_CARRY_MAX_MS
    ) {
      const firstAt = snapshots[0]?.snapshotAt.getTime();
      if (snapshots.length === 0 || (firstAt !== undefined && firstAt > from.getTime())) {
        points.push({
          at: from,
          status: baseline.status,
          source: "snapshot",
        });
      }
    }
    for (const s of snapshots) {
      points.push({
        at: s.snapshotAt,
        status: s.status,
        source: "snapshot",
      });
    }
    const boundedPoints = applyCarryWindow(points, STATUS_CARRY_MAX_MS);
    const latestPointAt = boundedPoints[boundedPoints.length - 1]?.at ?? null;
    const timelineEnd = latestPointAt
      ? new Date(Math.min(to.getTime(), latestPointAt.getTime() + STATUS_CARRY_MAX_MS))
      : from;
    const timeline = buildTimeline(boundedPoints, from, timelineEnd);

    const grouped = new Map<
      string,
      { label: string; entries: Array<{ from: string; to: string; status: string; minutes: number; source: "event" | "snapshot" }> }
    >();
    for (const interval of timeline.intervals) {
      const fromDate = new Date(interval.from);
      const toDate = new Date(interval.to);
      const segments = splitIntervalByDay(fromDate, toDate, tz);

      for (const segment of segments) {
        const fromFmt = formatInTz(segment.from, tz);
        const toFmt = formatInTz(segment.to, tz);
        const key = fromFmt.dayKey;
        const existing = grouped.get(key) ?? { label: fromFmt.date, entries: [] };
        existing.entries.push({
          from: fromFmt.time,
          to: toFmt.time,
          status: interval.status,
          minutes: segment.minutes,
          source: interval.source,
        });
        grouped.set(key, existing);
      }
    }

    const days = [...grouped.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dayKey, data]) => ({ dayKey, label: data.label, entries: data.entries }));

    return NextResponse.json({
      from: from.toISOString(),
      to: to.toISOString(),
      timezone: tz,
      item: {
        mlItemId: listing.mlItemId,
        titleSnapshot: listing.titleSnapshot,
        skuSnapshot: listing.skuSnapshot,
        imageUrlSnapshot: listing.imageUrlSnapshot,
      },
      totals: timeline.totals,
      days,
    });
  } catch (e) {
    logServerError("api/reports/catalog-competition/items/[itemId]", e);
    return NextResponse.json(apiErrorPayload(e, "catalog_item_report_failed"), {
      status: 502,
    });
  }
}

