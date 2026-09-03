import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fetchItemById } from "@/lib/mercadolibre/api";
import { mlAvailableStockUnits } from "@/lib/mercadolibre/ml-available-stock";
import { upsertListingFromItem } from "@/lib/mercadolibre/listing-sync";
import type { ItemBody } from "@/lib/mercadolibre/types";
import { prisma } from "@/lib/db";
import { syncPurchaseCycleFromWarehouse } from "@/lib/replenishment-cycle-data";
import { computeStockPlanningDisplay } from "@/lib/stock-planning";
import {
  loadOperationalSettings,
  toStockPlanningValues,
} from "@/lib/operational-settings";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { requireOrganization } from "@/lib/api-auth";
import { parseJsonBody } from "@/lib/api-validation";

type RouteContext = { params: Promise<{ mlItemId: string }> };

function itemOwnedByUser(item: ItemBody, userId: number): boolean {
  return item.seller_id === userId;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { mlItemId } = await context.params;
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { token, userId, organizationId } = auth.ctx;

  try {
    const item = await fetchItemById(token, mlItemId);
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (item.seller_id === undefined || !itemOwnedByUser(item, userId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { listing, warehouseStock } = await prisma.$transaction(
      async (tx) => {
        const listingRow = await upsertListingFromItem(organizationId, item, tx);

        const stockRow = await tx.warehouseStock.upsert({
          where: { mlItemId },
          create: { organizationId, mlItemId, quantity: 0 },
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
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { token, userId, organizationId } = auth.ctx;

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

    const existingStock = await prisma.warehouseStock.findUnique({
      where: { mlItemId },
      select: { quantity: true },
    });
    const previousQty = existingStock?.quantity ?? 0;

    const { listing, warehouseStock } = await prisma.$transaction(
      async (tx) => {
        const listingRow = await upsertListingFromItem(organizationId, item, tx);

        const existing = await tx.warehouseStock.findUnique({
          where: { mlItemId },
        });

        const stockRow = await tx.warehouseStock.upsert({
          where: { mlItemId },
          create: {
            organizationId,
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
      const stockPlanning = toStockPlanningValues(
        await loadOperationalSettings(organizationId),
      );
      const purchasePlan = computeStockPlanningDisplay(
        mlAvailableStockUnits(item) + warehouseStock.quantity,
        0,
        stockPlanning.salesAverageWindowDays,
        stockPlanning,
        purchaseLead,
      );
      await syncPurchaseCycleFromWarehouse(
        organizationId,
        mlItemId,
        warehouseStock.quantity,
        { needsPurchaseAttention: purchasePlan.needsPurchaseAttention },
      );
    }

    return NextResponse.json({ listing, warehouseStock });
  } catch (e) {
    logServerError("api/inventory/[mlItemId] PATCH", e);
    return NextResponse.json(apiErrorPayload(e, "inventory_patch_failed"), {
      status: 502,
    });
  }
}
