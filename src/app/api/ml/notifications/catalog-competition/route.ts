import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  deriveStatusFromPriceToWin,
  extractPriceToWin,
} from "@/lib/catalog-competition";
import { fetchItemPriceToWin } from "@/lib/mercadolibre/api";
import { resolveSellerAccessToken } from "@/lib/mercadolibre/persist-seller-tokens";
import { logServerError } from "@/lib/server-public-error";
import { isEncryptionKeyConfigured } from "@/lib/app-secret-crypto";

/**
 * ML catalog competition webhooks are triggers only: the POST body usually has no
 * reliable status fields. We fetch `price_to_win` for *our* item and persist a
 * snapshot only when the derived status changed vs the latest stored snapshot.
 *
 * Access token comes from DB-stored OAuth credentials (encrypted refresh), keyed
 * by `user_id` in the notification payload — same seller as after login.
 *
 * ML API transient errors: respond 200 so ML does not retry aggressively; DB errors
 * use 5xx so the notification can be retried.
 */
function extractItemId(resource: unknown): string | null {
  if (typeof resource !== "string") return null;
  const m = resource.match(/\/items\/([^/]+)\/price_to_win/i);
  return m?.[1] ?? null;
}

function parseMlUserId(payload: Record<string, unknown>): number | null {
  const v = payload.user_id;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

type NotificationPayload = Record<string, unknown> & {
  topic?: string;
  resource?: string;
  sent?: string;
  received?: string;
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
    return NextResponse.json({ ok: true, ignored: "topic" });
  }

  const itemId = extractItemId(payload.resource);
  if (!itemId) {
    return NextResponse.json({ ok: true, ignored: "resource" });
  }

  if (!isEncryptionKeyConfigured()) {
    return NextResponse.json(
      {
        ok: true,
        skipped: "missing_encryption_key",
        hint: "Set ENCRYPTION_KEY so seller tokens can be stored and read for webhooks.",
      },
      { status: 200 },
    );
  }

  const mlUserId = parseMlUserId(payload);
  if (mlUserId === null) {
    return NextResponse.json(
      { ok: true, skipped: "missing_user_id", hint: "Notification payload had no user_id." },
      { status: 200 },
    );
  }

  const token = await resolveSellerAccessToken(mlUserId);
  if (!token) {
    return NextResponse.json(
      {
        ok: true,
        skipped: "no_stored_credentials",
        hint: "Log in once via Mercado Livre so tokens are saved for this seller.",
        mlUserId,
      },
      { status: 200 },
    );
  }

  let pricePayload: Record<string, unknown>;
  try {
    const raw = await fetchItemPriceToWin(token, itemId);
    pricePayload = raw as Record<string, unknown>;
  } catch (e) {
    logServerError(`api/ml/notifications/catalog-competition price_to_win item=${itemId}`, e);
    return NextResponse.json(
      { ok: true, skipped: "ml_api_error", itemId },
      { status: 200 },
    );
  }

  const rawResponse = JSON.parse(JSON.stringify(pricePayload));
  const status = deriveStatusFromPriceToWin(pricePayload);
  const priceToWin = extractPriceToWin(pricePayload);

  try {
    const latest = await prisma.catalogCompetitionSnapshot.findFirst({
      where: { mlItemId: itemId },
      select: { status: true },
      orderBy: { snapshotAt: "desc" },
    });

    if (latest?.status === status) {
      return NextResponse.json({
        ok: true,
        itemId,
        inserted: false,
        unchanged: true,
      });
    }

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

      await tx.catalogCompetitionSnapshot.create({
        data: {
          mlItemId: itemId,
          status,
          source: "webhook",
          priceToWin,
          rawResponse,
        },
      });
    });

    return NextResponse.json({
      ok: true,
      itemId,
      inserted: true,
      status,
    });
  } catch (e) {
    logServerError("api/ml/notifications/catalog-competition", e);
    return NextResponse.json({ error: "store_failed" }, { status: 500 });
  }
}
