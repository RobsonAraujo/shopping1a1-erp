import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  fetchItemById,
  enrichItemsWithFulfillmentStock,
} from "@/lib/mercadolibre/api";
import { fetchUnitsSoldForItemsInWindowCached } from "@/lib/mercadolibre/sales-window-cache";
import { computeFulfillmentDerivedFields } from "@/lib/inventory/fulfillment-row-fields";
import { upsertListingFromItem } from "@/lib/mercadolibre/listing-sync";
import type { ItemBody } from "@/lib/mercadolibre/types";
import { prisma } from "@/lib/db/db";
import { syncPurchaseCycleFromWarehouse } from "@/lib/compras/replenishment-cycle-data";
import {
  loadOperationalSettings,
  toStockPlanningValues,
} from "@/lib/configuracoes/operational-settings";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { requireOrganization } from "@/lib/api/api-auth";
import { parseJsonBody } from "@/lib/api/api-validation";

type RouteContext = { params: Promise<{ mlItemId: string }> };

function itemOwnedByUser(item: ItemBody, userId: number): boolean {
  return item.seller_id === userId;
}

/**
 * Recalcula os campos derivados da linha (mesma fórmula de
 * `src/app/dashboard/inventory/page.tsx`) — devolvidos na resposta pra o
 * client atualizar a linha editada localmente em vez de dar `router.refresh()`
 * (que refaria o sweep de catálogo inteiro por 1 edição). Custo extra aqui é
 * só 1-2 chamadas ML para ESTE item, não para o catálogo inteiro.
 */
async function computeUpdatedRowFields(
  token: string,
  userId: number,
  item: ItemBody,
  warehouseQuantity: number,
  purchaseLeadTimeDays: number | null,
  organizationId: string,
) {
  const operationalSettings = await loadOperationalSettings(organizationId);
  const stockPlanning = toStockPlanningValues(operationalSettings);

  const [fulfillmentByItem, soldByItem] = await Promise.all([
    enrichItemsWithFulfillmentStock(token, [item]),
    fetchUnitsSoldForItemsInWindowCached(
      organizationId,
      token,
      userId,
      [item.id],
      stockPlanning.salesAverageWindowDays,
      stockPlanning.salesWindowDateField,
    ),
  ]);

  return computeFulfillmentDerivedFields(
    item,
    fulfillmentByItem.get(item.id),
    warehouseQuantity,
    purchaseLeadTimeDays,
    soldByItem[item.id] ?? 0,
    stockPlanning,
  );
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

    const updatedRowFields = await computeUpdatedRowFields(
      token,
      userId,
      item,
      warehouseStock.quantity,
      warehouseStock.purchaseLeadTimeDays,
      organizationId,
    );

    if (quantity !== undefined && warehouseStock.quantity > previousQty) {
      await syncPurchaseCycleFromWarehouse(
        organizationId,
        mlItemId,
        warehouseStock.quantity,
        { needsPurchaseAttention: updatedRowFields.needsPurchaseAttention },
      );
    }

    // `row` traz os campos derivados (estoque ML, Full, "precisa comprar")
    // já recalculados pra este item específico — o client usa isso pra
    // atualizar a linha editada localmente, sem precisar de
    // `router.refresh()` (que refaria o sweep do catálogo inteiro).
    return NextResponse.json({ listing, warehouseStock, row: updatedRowFields });
  } catch (e) {
    logServerError("api/inventory/[mlItemId] PATCH", e);
    return NextResponse.json(apiErrorPayload(e, "inventory_patch_failed"), {
      status: 502,
    });
  }
}
