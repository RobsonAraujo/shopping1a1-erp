import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrganization } from "@/lib/api/api-auth";
import { parseJsonBody } from "@/lib/api/api-validation";
import { stockActionErrorResponse } from "@/lib/stock/stock-api-errors";
import { deleteStockCount, saveStockCountLines } from "@/lib/stock/stock-counts";

const bodySchema = z.object({
  lines: z
    .array(
      z.object({
        stockItemId: z.string().min(1).max(64),
        countedQty: z.number().int().min(0).max(10_000_000).nullable(),
        note: z.string().max(300).nullable(),
      }),
    )
    .min(1)
    .max(2000),
});

/** Salva o que foi contado (digitação da folha). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ countId: string }> },
) {
  const auth = await requireOrganization();
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { countId } = await params;
  const parsed = await parseJsonBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;
  try {
    await saveStockCountLines({ organizationId: auth.ctx.organizationId, countId, lines: parsed.data.lines });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return stockActionErrorResponse("api/stock/counts/[countId] PATCH", e);
  }
}

/** Exclui um inventário não aprovado (em contagem ou cancelado). */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ countId: string }> },
) {
  const auth = await requireOrganization();
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { countId } = await params;
  try {
    await deleteStockCount(auth.ctx.organizationId, countId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return stockActionErrorResponse("api/stock/counts/[countId] DELETE", e);
  }
}
