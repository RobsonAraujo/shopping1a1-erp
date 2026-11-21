import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrganization } from "@/lib/api/api-auth";
import { parseJsonBody } from "@/lib/api/api-validation";
import { prisma } from "@/lib/db/db";
import { logServerError } from "@/lib/infra/server-public-error";

const bodySchema = z.object({
  /** Prazo compra → chegada no galpão, em dias. `null` limpa. */
  purchaseLeadTimeDays: z.number().int().min(0).max(365).nullable(),
});

/**
 * Prazo de compra do produto (usado pelo Compras e pelo Kanban). Gravado em
 * `WarehouseStock` de todas as opções de venda do item, porque o Compras lê
 * por anúncio.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ stockItemId: string }> },
) {
  const auth = await requireOrganization();
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { organizationId } = auth.ctx;
  const { stockItemId } = await params;

  const parsed = await parseJsonBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;

  try {
    const item = await prisma.stockItem.findFirst({
      where: { id: stockItemId, organizationId },
      select: { listings: { select: { mlItemId: true } } },
    });
    if (!item) return NextResponse.json({ error: "stock_item_not_found" }, { status: 404 });
    for (const { mlItemId } of item.listings) {
      await prisma.warehouseStock.upsert({
        where: { mlItemId },
        create: { mlItemId, organizationId, purchaseLeadTimeDays: parsed.data.purchaseLeadTimeDays },
        update: { purchaseLeadTimeDays: parsed.data.purchaseLeadTimeDays },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    logServerError("api/stock/items/[stockItemId]/lead-time PATCH", e);
    return NextResponse.json({ error: "stock_action_failed" }, { status: 500 });
  }
}
