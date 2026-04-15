import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeCompetitionStatus } from "@/lib/catalog-competition";
import { logServerError } from "@/lib/server-public-error";

function extractItemId(resource: unknown): string | null {
  if (typeof resource !== "string") return null;
  const m = resource.match(/\/items\/([^/]+)\/price_to_win/i);
  return m?.[1] ?? null;
}

type NotificationPayload = {
  topic?: string;
  resource?: string;
  sent?: string;
  received?: string;
  status?: string;
  item_competition_status?: string;
  action?: string;
  [key: string]: unknown;
};

export async function POST(request: NextRequest) {
  let payload: NotificationPayload;
  try {
    payload = (await request.json()) as NotificationPayload;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const topic = payload.topic ?? "";
  if (topic && topic !== "catalog_item_competition_status") {
    // Ack unknown topic to avoid retries on shared callback urls.
    return NextResponse.json({ ok: true, ignored: "topic" });
  }

  const itemId = extractItemId(payload.resource);
  if (!itemId) {
    return NextResponse.json({ ok: true, ignored: "resource" });
  }

  const status = normalizeCompetitionStatus(
    payload.status ?? payload.item_competition_status ?? payload.action,
  );
  const eventAt = payload.sent ? new Date(payload.sent) : new Date();
  const rawPayload = JSON.parse(JSON.stringify(payload));

  try {
    await prisma.$transaction(async (tx) => {
      await tx.listing.upsert({
        where: { mlItemId: itemId },
        create: {
          mlItemId: itemId,
          catalogListing: true,
          activeOnMl: true,
          lastSyncedAt: new Date(),
        },
        update: {
          catalogListing: true,
          lastSyncedAt: new Date(),
        },
      });

      await tx.catalogCompetitionEvent.create({
        data: {
          mlItemId: itemId,
          status,
          source: "webhook",
          eventAt,
          rawPayload,
        },
      });
    });
  } catch (e) {
    logServerError("api/ml/notifications/catalog-competition", e);
    return NextResponse.json({ error: "store_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

