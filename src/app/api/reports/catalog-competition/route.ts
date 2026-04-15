import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { buildTimeline, type CompetitionPoint } from "@/lib/catalog-competition";
import { getValidAccessToken } from "@/lib/mercadolibre/session";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";

function parseWindowDays(v: string | null): 7 | 30 {
  return v === "30d" ? 30 : 7;
}

function hourlyBreakdown(intervals: Array<{ from: string; to: string; status: string }>) {
  const out: Record<string, { winning: number; losing: number; shared: number; unknown: number }> = {};
  for (let h = 0; h < 24; h += 1) {
    out[String(h).padStart(2, "0")] = { winning: 0, losing: 0, shared: 0, unknown: 0 };
  }

  for (const interval of intervals) {
    const from = new Date(interval.from);
    const to = new Date(interval.to);
    let cursor = new Date(from);
    while (cursor < to) {
      const bucketStart = new Date(cursor);
      bucketStart.setMinutes(0, 0, 0);
      const nextHour = new Date(bucketStart);
      nextHour.setHours(nextHour.getHours() + 1);
      const end = nextHour < to ? nextHour : to;
      const mins = Math.max(0, Math.round((end.getTime() - cursor.getTime()) / 60000));
      const key = String(bucketStart.getHours()).padStart(2, "0");
      const status =
        interval.status === "winning" ||
        interval.status === "losing" ||
        interval.status === "shared"
          ? interval.status
          : "unknown";
      out[key][status] += mins;
      cursor = end;
    }
  }
  return out;
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const windowDays = parseWindowDays(request.nextUrl.searchParams.get("window"));
  const itemId = request.nextUrl.searchParams.get("itemId");
  const to = new Date();
  const from = new Date(to.getTime() - windowDays * 24 * 60 * 60 * 1000);

  try {
    const listings = await prisma.listing.findMany({
      where: {
        catalogListing: true,
        ...(itemId ? { mlItemId: itemId } : {}),
      },
      select: {
        mlItemId: true,
        titleSnapshot: true,
        skuSnapshot: true,
        imageUrlSnapshot: true,
      },
      orderBy: { updatedAt: "desc" },
    });
    const itemIds = listings.map((l) => l.mlItemId);
    if (itemIds.length === 0) {
      return NextResponse.json({
        windowDays,
        from: from.toISOString(),
        to: to.toISOString(),
        totals: { winning: 0, losing: 0, shared: 0, unknown: 0 },
        items: [],
      });
    }

    const [events, snapshots] = await Promise.all([
      prisma.catalogCompetitionEvent.findMany({
        where: {
          mlItemId: { in: itemIds },
          eventAt: { gte: from, lte: to },
        },
        select: { mlItemId: true, eventAt: true, status: true },
      }),
      prisma.catalogCompetitionSnapshot.findMany({
        where: {
          mlItemId: { in: itemIds },
          snapshotAt: { gte: from, lte: to },
        },
        select: { mlItemId: true, snapshotAt: true, status: true },
      }),
    ]);

    const totals = { winning: 0, losing: 0, shared: 0, unknown: 0 };
    const items = listings.map((listing) => {
      const points: CompetitionPoint[] = [
        ...events
          .filter((e) => e.mlItemId === listing.mlItemId)
          .map((e) => ({
            at: e.eventAt,
            status: e.status,
            source: "event" as const,
          })),
        ...snapshots
          .filter((s) => s.mlItemId === listing.mlItemId)
          .map((s) => ({
            at: s.snapshotAt,
            status: s.status,
            source: "snapshot" as const,
          })),
      ];
      const timeline = buildTimeline(points, from, to);
      totals.winning += timeline.totals.winning;
      totals.losing += timeline.totals.losing;
      totals.shared += timeline.totals.shared;
      totals.unknown += timeline.totals.unknown;

      return {
        mlItemId: listing.mlItemId,
        titleSnapshot: listing.titleSnapshot,
        skuSnapshot: listing.skuSnapshot,
        imageUrlSnapshot: listing.imageUrlSnapshot,
        totals: timeline.totals,
        timeline: timeline.intervals,
        hourly: hourlyBreakdown(timeline.intervals),
      };
    });

    return NextResponse.json({
      windowDays,
      from: from.toISOString(),
      to: to.toISOString(),
      totals,
      items,
    });
  } catch (e) {
    logServerError("api/reports/catalog-competition", e);
    return NextResponse.json(apiErrorPayload(e, "catalog_report_failed"), {
      status: 502,
    });
  }
}

