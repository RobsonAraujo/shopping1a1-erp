import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrganization } from "@/lib/api/api-auth";
import { parseJsonBody } from "@/lib/api/api-validation";
import { stockActionErrorResponse } from "@/lib/stock/stock-api-errors";
import { createStockCount } from "@/lib/stock/stock-counts";

export const maxDuration = 120;

const bodySchema = z.object({
  supplierName: z.string().max(200).nullable().optional(),
  onlyWithStock: z.boolean().default(true),
  blind: z.boolean().default(false),
});

/** Cria um inventário (congela a referência e o "a enviar" de cada produto). */
export async function POST(request: Request) {
  const auth = await requireOrganization();
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { token, userId, organizationId } = auth.ctx;
  const parsed = await parseJsonBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;
  try {
    const result = await createStockCount({
      organizationId,
      mlUserId: userId,
      accessToken: token,
      supplierName: parsed.data.supplierName ?? null,
      onlyWithStock: parsed.data.onlyWithStock,
      blind: parsed.data.blind,
    });
    return NextResponse.json({ ok: true, countId: result.countId });
  } catch (e) {
    return stockActionErrorResponse("api/stock/counts POST", e);
  }
}
