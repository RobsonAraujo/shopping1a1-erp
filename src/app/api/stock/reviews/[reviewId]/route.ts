import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrganization } from "@/lib/api/api-auth";
import { parseJsonBody } from "@/lib/api/api-validation";
import { resolveStockReview } from "@/lib/stock/stock-actions";
import { stockActionErrorResponse } from "@/lib/stock/stock-api-errors";

const quantity = z.number().int().min(1).max(10_000_000);
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("returned_good"), quantity }),
  z.object({ action: z.literal("returned_damaged") }),
  z.object({ action: z.literal("not_returned") }),
  z.object({ action: z.literal("link_listing"), stockItemId: z.string().min(1).max(64) }),
  z.object({ action: z.literal("dismiss") }),
]);

/** Decide uma pendência do estoque (devolução a conferir, venda sem item). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ reviewId: string }> },
) {
  const auth = await requireOrganization();
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { userId, organizationId } = auth.ctx;
  const { reviewId } = await params;

  const parsed = await parseJsonBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;
  try {
    await resolveStockReview({ organizationId, mlUserId: userId, reviewId, decision: parsed.data });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return stockActionErrorResponse("api/stock/reviews/[reviewId] POST", e);
  }
}
