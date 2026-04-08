import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { fetchItemById } from "@/lib/mercadolibre/api";
import type { ItemBody } from "@/lib/mercadolibre/types";
import { prisma } from "@/lib/db";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import {
  getValidAccessToken,
  readSession,
} from "@/lib/mercadolibre/session";

type RouteContext = { params: Promise<{ mlItemId: string }> };

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

export async function GET(_request: NextRequest, context: RouteContext) {
  const { mlItemId } = await context.params;
  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);
  const { userId } = readSession(cookieStore);

  if (!token || userId === undefined) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const item = await fetchItemById(token, mlItemId);
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (item.seller_id === undefined || !itemOwnedByUser(item, userId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const listingData = listingUpsertData(item);

    const { listing, warehouseStock } = await prisma.$transaction(
      async (tx) => {
        const listingRow = await tx.listing.upsert({
          where: { mlItemId },
          create: {
            mlItemId,
            ...listingData,
          },
          update: listingData,
        });

        const stockRow = await tx.warehouseStock.upsert({
          where: { mlItemId },
          create: { mlItemId, quantity: 0 },
          update: {},
        });

        return { listing: listingRow, warehouseStock: stockRow };
      },
    );

    return NextResponse.json({ listing, warehouseStock });
  } catch (e) {
    logServerError("api/inventory/[mlItemId] GET", e);
    return NextResponse.json(apiErrorPayload(e, "inventory_get_failed"), {
      status: 502,
    });
  }
}

type PatchBody = {
  quantity?: unknown;
  notes?: unknown;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { mlItemId } = await context.params;
  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);
  const { userId } = readSession(cookieStore);

  if (!token || userId === undefined) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const quantity = body.quantity;
  if (typeof quantity !== "number" || !Number.isInteger(quantity)) {
    return NextResponse.json(
      { error: "quantity must be an integer" },
      { status: 400 },
    );
  }
  if (quantity < 0) {
    return NextResponse.json(
      { error: "quantity must be >= 0" },
      { status: 400 },
    );
  }

  let notes: string | null | undefined;
  if (body.notes !== undefined) {
    if (body.notes !== null && typeof body.notes !== "string") {
      return NextResponse.json(
        { error: "notes must be a string or null" },
        { status: 400 },
      );
    }
    notes = body.notes === null ? null : body.notes;
  }

  try {
    const item = await fetchItemById(token, mlItemId);
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (item.seller_id === undefined || !itemOwnedByUser(item, userId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const listingData = listingUpsertData(item);

    const { listing, warehouseStock } = await prisma.$transaction(
      async (tx) => {
        const listingRow = await tx.listing.upsert({
          where: { mlItemId },
          create: {
            mlItemId,
            ...listingData,
          },
          update: listingData,
        });

        const stockRow = await tx.warehouseStock.upsert({
          where: { mlItemId },
          create: {
            mlItemId,
            quantity,
            notes: notes ?? null,
          },
          update: {
            quantity,
            ...(notes !== undefined ? { notes } : {}),
          },
        });

        return { listing: listingRow, warehouseStock: stockRow };
      },
    );

    return NextResponse.json({ listing, warehouseStock });
  } catch (e) {
    logServerError("api/inventory/[mlItemId] PATCH", e);
    return NextResponse.json(apiErrorPayload(e, "inventory_patch_failed"), {
      status: 502,
    });
  }
}
