import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { stockPlanningConfig } from "@/config/stock-planning";
import { fetchItemById } from "@/lib/mercadolibre/api";
import { mlAvailableStockUnits } from "@/lib/mercadolibre/ml-available-stock";
import type { ItemBody } from "@/lib/mercadolibre/types";
import { prisma } from "@/lib/db";
import { syncPurchaseCycleFromWarehouse } from "@/lib/replenishment-cycle-data";
import { computeStockPlanningDisplay } from "@/lib/stock-planning";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { requireAuth, unauthorizedResponse } from "@/lib/api-auth";
import { parseJsonBody } from "@/lib/api-validation";

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
    mlStatus: item.status ?? null,
  };
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { mlItemId } = await context.params;
  const auth = await requireAuth();
  if (!auth) return unauthorizedResponse();
  const { token, userId } = auth;

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

const MAX_PURCHASE_LEAD_TIME_DAYS = 365;

const patchBodySchema = z.object({
  quantity: z.number().int().min(0, "quantity must be >= 0").optional(),
  notes: z.string().nullable().optional(),
  purchaseLeadTimeDays: z
    .number()
    .int()
    .min(0)
    .max(MAX_PURCHASE_LEAD_TIME_DAYS)
    .nullable()
    .optional(),
  targetCoverageDays: z.number().int().min(0).nullable().optional(),
});

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { mlItemId } = await context.params;
  const auth = await requireAuth();
  if (!auth) return unauthorizedResponse();
  const { token, userId } = auth;

  const parsedBody = await parseJsonBody(request, patchBodySchema);
  if (!parsedBody.ok) return parsedBody.response;
  const { quantity, notes, purchaseLeadTimeDays, targetCoverageDays } =
    parsedBody.data;

  try {
    const item = await fetchItemById(token, mlItemId);
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (item.seller_id === undefined || !itemOwnedByUser(item, userId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const listingData = listingUpsertData(item);

    const existingStock = await prisma.warehouseStock.findUnique({
      where: { mlItemId },
      select: { quantity: true },
    });
    const previousQty = existingStock?.quantity ?? 0;

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

        const existing = await tx.warehouseStock.findUnique({
          where: { mlItemId },
        });

        const stockRow = await tx.warehouseStock.upsert({
          where: { mlItemId },
          create: {
            mlItemId,
            quantity: quantity ?? 0,
            notes: notes ?? null,
            ...(purchaseLeadTimeDays !== undefined
              ? { purchaseLeadTimeDays }
              : {}),
            ...(targetCoverageDays !== undefined
              ? { targetCoverageDays }
              : {}),
          },
          update: {
            ...(quantity !== undefined ? { quantity } : {}),
            ...(notes !== undefined ? { notes } : {}),
            ...(purchaseLeadTimeDays !== undefined
              ? { purchaseLeadTimeDays }
              : {}),
            ...(targetCoverageDays !== undefined
              ? { targetCoverageDays }
              : {}),
            ...(quantity === undefined && !existing
              ? { quantity: 0 }
              : {}),
          },
        });

        return { listing: listingRow, warehouseStock: stockRow };
      },
    );

    if (quantity !== undefined && warehouseStock.quantity > previousQty) {
      const purchaseLead =
        warehouseStock.purchaseLeadTimeDays ?? 0;
      const purchasePlan = computeStockPlanningDisplay(
        mlAvailableStockUnits(item) + warehouseStock.quantity,
        0,
        stockPlanningConfig.salesAverageWindowDays,
        stockPlanningConfig,
        purchaseLead,
      );
      await syncPurchaseCycleFromWarehouse(mlItemId, warehouseStock.quantity, {
        needsPurchaseAttention: purchasePlan.needsPurchaseAttention,
      });
    }

    return NextResponse.json({ listing, warehouseStock });
  } catch (e) {
    logServerError("api/inventory/[mlItemId] PATCH", e);
    return NextResponse.json(apiErrorPayload(e, "inventory_patch_failed"), {
      status: 502,
    });
  }
}
