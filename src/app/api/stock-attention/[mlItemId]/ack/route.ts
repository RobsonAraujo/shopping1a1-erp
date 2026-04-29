import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { fetchItemById } from "@/lib/mercadolibre/api";
import type { ItemBody } from "@/lib/mercadolibre/types";
import { prisma } from "@/lib/db";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { getValidAccessToken, readSession } from "@/lib/mercadolibre/session";

type RouteContext = { params: Promise<{ mlItemId: string }> };
type AttentionKind = "full" | "purchase";
type AckBody = {
  kind?: unknown;
};

function itemOwnedByUser(item: ItemBody, userId: number): boolean {
  return item.seller_id === userId;
}

function listingUpsertData(item: ItemBody) {
  const activeOnMl = item.status === "active" || item.status === "paused";
  return {
    titleSnapshot: item.title,
    catalogListing: item.catalog_listing ?? null,
    lastSyncedAt: new Date(),
    activeOnMl,
  };
}

function parseAttentionKind(value: unknown): AttentionKind | null {
  return value === "full" || value === "purchase" ? value : null;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { mlItemId } = await context.params;
  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);
  const { userId } = readSession(cookieStore);

  if (!token || userId === undefined) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: AckBody;
  try {
    body = (await request.json()) as AckBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const kind = parseAttentionKind(body.kind);
  if (!kind) {
    return NextResponse.json(
      { error: "kind must be full or purchase" },
      { status: 400 },
    );
  }

  try {
    const item = await fetchItemById(token, mlItemId);
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (item.seller_id === undefined || !itemOwnedByUser(item, userId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const warehouseStock = await prisma.warehouseStock.findUnique({
      where: { mlItemId },
      select: { quantity: true, purchaseLeadTimeDays: true },
    });
    const warehouseQuantity = warehouseStock?.quantity ?? 0;
    const purchaseLeadTimeDays = warehouseStock?.purchaseLeadTimeDays ?? null;

    const acknowledgement = await prisma.$transaction(async (tx) => {
      await tx.listing.upsert({
        where: { mlItemId },
        create: {
          mlItemId,
          ...listingUpsertData(item),
        },
        update: listingUpsertData(item),
      });

      return tx.stockAttentionAcknowledgement.upsert({
        where: {
          mlItemId_kind: { mlItemId, kind },
        },
        create: {
          mlItemId,
          kind,
          mlAvailableQuantity: item.available_quantity,
          warehouseQuantity,
          purchaseLeadTimeDays,
        },
        update: {
          mlAvailableQuantity: item.available_quantity,
          warehouseQuantity,
          purchaseLeadTimeDays,
          acknowledgedAt: new Date(),
        },
      });
    });

    return NextResponse.json({ ok: true, acknowledgement });
  } catch (e) {
    logServerError("api/stock-attention/[mlItemId]/ack POST", e);
    return NextResponse.json(apiErrorPayload(e, "stock_attention_ack_failed"), {
      status: 502,
    });
  }
}
