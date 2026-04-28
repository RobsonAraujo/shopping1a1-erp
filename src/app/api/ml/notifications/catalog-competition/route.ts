import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  type CompetitionStatus,
  deriveStatusFromPriceToWin,
  extractPriceToWin,
} from "@/lib/catalog-competition";
import { fetchItemById, fetchItemPriceToWin } from "@/lib/mercadolibre/api";
import type { ItemBody } from "@/lib/mercadolibre/types";
import { resolveSellerAccessToken } from "@/lib/mercadolibre/persist-seller-tokens";
import { canSendWebPush, sendWebPushNotification } from "@/lib/push/webpush";
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
  const direct = resource.match(/\/items\/([^/?#]+)/i);
  if (direct?.[1]) return direct[1];

  const anywhere = resource.match(/\b(ML[A-Z]?\d+)\b/i);
  return anywhere?.[1]?.toUpperCase() ?? null;
}

function parseMlUserId(payload: Record<string, unknown>): number | null {
  const v = payload.user_id ?? payload.userId ?? payload.application_user_id;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseWebhookDate(payload: NotificationPayload): Date {
  const raw = payload.sent ?? payload.received;
  if (typeof raw !== "string") return new Date();

  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function jsonSafe(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

function webhookLog(message: string, details: Record<string, unknown>) {
  console.info("[catalog-competition-webhook]", message, details);
}

function webhookWarn(message: string, details: Record<string, unknown>) {
  console.warn("[catalog-competition-webhook]", message, details);
}

function shouldSendCompetitionPushAlert(
  previousStatus: CompetitionStatus | null,
  status: CompetitionStatus,
) {
  if (status === "losing") {
    return previousStatus === "winning" || previousStatus === "shared";
  }
  return (
    status === "winning" &&
    (previousStatus === "shared" || previousStatus === "losing")
  );
}

function pushPayloadForStatus(
  itemId: string,
  itemTitle: string | null,
  itemUrl: string | null,
  previousStatus: CompetitionStatus | null,
  status: CompetitionStatus,
  snapshotAt: Date,
) {
  const itemLabel = itemTitle?.trim() || itemId;
  const url = itemUrl?.trim() || `/dashboard/catalog-report/${encodeURIComponent(itemId)}`;

  if (status === "winning") {
    const body =
      previousStatus === "losing"
        ? `${itemLabel} voltou a ganhar no catálogo às ${snapshotAt.toLocaleTimeString("pt-BR")}.`
        : `${itemLabel} saiu de compartilhando e passou a ganhar às ${snapshotAt.toLocaleTimeString("pt-BR")}.`;

    return {
      title: "Anúncio ganhou no catálogo",
      body,
      url,
      tag: `catalog-winning-${itemId}`,
    };
  }

  return {
    title: "Anúncio perdendo no catálogo",
    body: `${itemLabel} passou a perder às ${snapshotAt.toLocaleTimeString("pt-BR")}.`,
    url,
    tag: `catalog-losing-${itemId}`,
  };
}

async function sendCompetitionPushAlert(
  mlUserId: number,
  itemId: string,
  itemTitle: string | null,
  itemUrl: string | null,
  previousStatus: CompetitionStatus | null,
  status: CompetitionStatus,
  snapshotAt: Date,
) {
  if (!canSendWebPush()) {
    webhookWarn("webpush not configured", { mlUserId, itemId });
    return;
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { mlUserId },
    select: { endpoint: true, p256dh: true, auth: true },
  });
  if (subscriptions.length === 0) return;

  const payload = pushPayloadForStatus(
    itemId,
    itemTitle,
    itemUrl,
    previousStatus,
    status,
    snapshotAt,
  );

  for (const subscription of subscriptions) {
    try {
      await sendWebPushNotification(subscription, payload);
    } catch (error) {
      const statusCode =
        typeof error === "object" &&
        error !== null &&
        "statusCode" in error &&
        typeof (error as { statusCode?: unknown }).statusCode === "number"
          ? (error as { statusCode: number }).statusCode
          : null;

      if (statusCode === 404 || statusCode === 410) {
        await prisma.pushSubscription.deleteMany({
          where: { mlUserId, endpoint: subscription.endpoint },
        });
        continue;
      }

      webhookWarn("failed to send push", {
        mlUserId,
        itemId,
        endpoint: subscription.endpoint,
      });
    }
  }
}

async function createSnapshotWithRetry(data: {
  mlItemId: string;
  status: CompetitionStatus;
  source: "webhook";
  priceToWin: number | null;
  snapshotAt: Date;
  rawResponse: unknown;
}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.catalogCompetitionSnapshot.create({
        data: {
          ...data,
          snapshotAt: new Date(data.snapshotAt.getTime() + attempt),
          rawResponse: jsonSafe(data.rawResponse),
        },
      });
    } catch (e) {
      const code =
        typeof e === "object" && e !== null && "code" in e
          ? String((e as { code?: unknown }).code)
          : "";
      if (code !== "P2002" || attempt === 2) throw e;
    }
  }
}

type NotificationPayload = Record<string, unknown> & {
  topic?: string;
  resource?: string;
  sent?: string;
  received?: string;
  debugPriceToWin?: Record<string, unknown>;
  debugBypassCredentials?: boolean;
};

export async function POST(request: NextRequest) {
  let payload: NotificationPayload;
  try {
    payload = (await request.json()) as NotificationPayload;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const topic = payload.topic ?? "";
  const debugPriceToWin =
    process.env.NODE_ENV !== "production" ? payload.debugPriceToWin : undefined;
  const isDebugSimulation =
    debugPriceToWin !== undefined && payload.debugBypassCredentials === true;

  if (topic && topic !== "catalog_item_competition_status") {
    webhookLog("ignored topic", { topic });
    return NextResponse.json({ ok: true, ignored: "topic", topic });
  }

  const itemId = extractItemId(payload.resource);
  if (!itemId) {
    webhookWarn("ignored resource", {
      topic,
      resource: payload.resource,
      reason: "item_id_not_found",
    });
    return NextResponse.json({
      ok: true,
      ignored: "resource",
      topic,
      resource: payload.resource,
      hint: "Could not extract item id from notification resource.",
    });
  }

  if (!isDebugSimulation && !isEncryptionKeyConfigured()) {
    webhookWarn("missing encryption key", { topic, itemId });
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
    webhookWarn("missing user id", { topic, itemId, resource: payload.resource });
    return NextResponse.json(
      {
        ok: true,
        skipped: "missing_user_id",
        itemId,
        hint: "Notification payload had no user_id.",
      },
      { status: 200 },
    );
  }

  let token: string | null = null;
  if (!isDebugSimulation) {
    const storedCredentials = await prisma.mlSellerCredentials.findUnique({
      where: { mlUserId },
      select: { mlUserId: true },
    });
    if (!storedCredentials) {
      webhookWarn("no stored credentials", { topic, itemId, mlUserId });
      return NextResponse.json(
        {
          ok: true,
          skipped: "no_stored_credentials",
          hint: "Log in once via Mercado Livre so tokens are saved for this seller.",
          itemId,
          mlUserId,
        },
        { status: 200 },
      );
    }

    token = await resolveSellerAccessToken(mlUserId);
    if (!token) {
      webhookWarn("stored credentials unusable", { topic, itemId, mlUserId });
      return NextResponse.json(
        {
          ok: true,
          skipped: "stored_credentials_unusable",
          hint: "Stored seller credentials could not be decrypted or refreshed.",
          itemId,
          mlUserId,
        },
        { status: 200 },
      );
    }
  }

  let pricePayload: Record<string, unknown>;
  try {
    const raw = debugPriceToWin ?? (await fetchItemPriceToWin(token ?? "", itemId));
    pricePayload = raw as Record<string, unknown>;
  } catch (e) {
    logServerError(`api/ml/notifications/catalog-competition price_to_win item=${itemId}`, e);
    return NextResponse.json(
      { ok: true, skipped: "ml_api_error", itemId },
      { status: 200 },
    );
  }

  let itemDetails: ItemBody | null = null;
  if (token) {
    try {
      itemDetails = await fetchItemById(token, itemId);
    } catch (e) {
      logServerError(`api/ml/notifications/catalog-competition item item=${itemId}`, e);
    }
  }

  const snapshotAt = parseWebhookDate(payload);
  const rawResponse = {
    notification: jsonSafe(payload),
    priceToWin: jsonSafe(pricePayload),
    item: itemDetails ? jsonSafe(itemDetails) : null,
  };
  const status = deriveStatusFromPriceToWin(pricePayload);
  const priceToWin = extractPriceToWin(pricePayload);

  try {
    const [latest, existingListing] = await Promise.all([
      prisma.catalogCompetitionSnapshot.findFirst({
        where: { mlItemId: itemId },
        select: { status: true, snapshotAt: true },
        orderBy: { snapshotAt: "desc" },
      }),
      prisma.listing.findUnique({
        where: { mlItemId: itemId },
        select: { titleSnapshot: true },
      }),
    ]);

    const previousStatus = latest?.status ?? null;
    if (previousStatus === status) {
      webhookLog("unchanged status", {
        itemId,
        mlUserId,
        status,
        latestSnapshotAt: latest?.snapshotAt.toISOString(),
      });
      return NextResponse.json({
        ok: true,
        itemId,
        mlUserId,
        status,
        inserted: false,
        unchanged: true,
      });
    }

    await prisma.listing.upsert({
      where: { mlItemId: itemId },
      create: {
        mlItemId: itemId,
        titleSnapshot: itemDetails?.title ?? null,
        catalogListing: true,
        activeOnMl: true,
        lastSyncedAt: new Date(),
      },
      update: {
        titleSnapshot: itemDetails?.title ?? undefined,
        catalogListing: true,
        lastSyncedAt: new Date(),
      },
    });

    await createSnapshotWithRetry({
      mlItemId: itemId,
      status,
      source: "webhook",
      priceToWin,
      snapshotAt,
      rawResponse,
    });

    const pushNotificationTriggered = shouldSendCompetitionPushAlert(
      previousStatus,
      status,
    );
    if (pushNotificationTriggered) {
      await sendCompetitionPushAlert(
        mlUserId,
        itemId,
        itemDetails?.title ?? existingListing?.titleSnapshot ?? null,
        itemDetails?.permalink ?? null,
        previousStatus,
        status,
        snapshotAt,
      );
    }

    webhookLog("inserted snapshot", {
      itemId,
      mlUserId,
      status,
      snapshotAt: snapshotAt.toISOString(),
    });
    return NextResponse.json({
      ok: true,
      itemId,
      mlUserId,
      inserted: true,
      status,
      snapshotAt: snapshotAt.toISOString(),
      pushNotificationTriggered,
    });
  } catch (e) {
    logServerError("api/ml/notifications/catalog-competition", e);
    return NextResponse.json({ error: "store_failed" }, { status: 500 });
  }
}
