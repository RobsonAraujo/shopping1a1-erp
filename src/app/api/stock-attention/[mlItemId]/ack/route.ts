import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fetchItemById } from "@/lib/mercadolibre/api";
import { mlAvailableStockUnits } from "@/lib/mercadolibre/ml-available-stock";
import { upsertListingFromItem } from "@/lib/mercadolibre/listing-sync";
import type { ItemBody } from "@/lib/mercadolibre/types";
import { prisma } from "@/lib/db";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { requireOrganization } from "@/lib/api-auth";
import { parseJsonBody } from "@/lib/api-validation";

type RouteContext = { params: Promise<{ mlItemId: string }> };

const ackBodySchema = z.object({
  kind: z.enum(["full", "purchase"], {
    error: "kind must be full or purchase",
  }),
});

function itemOwnedByUser(item: ItemBody, userId: number): boolean {
  return item.seller_id === userId;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { mlItemId } = await context.params;
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { token, userId, organizationId } = auth.ctx;

  const parsedBody = await parseJsonBody(request, ackBodySchema);
  if (!parsedBody.ok) return parsedBody.response;
  const { kind } = parsedBody.data;

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

    const mlAvailableQuantity = mlAvailableStockUnits(item);

    const acknowledgement = await prisma.$transaction(async (tx) => {
      await upsertListingFromItem(organizationId, item, tx);

      return tx.stockAttentionAcknowledgement.upsert({
        where: {
          mlItemId_kind: { mlItemId, kind },
        },
        create: {
          organizationId,
          mlItemId,
          kind,
          mlAvailableQuantity,
          warehouseQuantity,
          purchaseLeadTimeDays,
        },
        update: {
          mlAvailableQuantity,
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
