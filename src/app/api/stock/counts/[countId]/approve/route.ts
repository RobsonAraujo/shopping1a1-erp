import { NextResponse } from "next/server";
import { requireOrganization } from "@/lib/api/api-auth";
import { stockActionErrorResponse } from "@/lib/stock/stock-api-errors";
import { approveStockCount } from "@/lib/stock/stock-counts";

/** Aprova o inventário: cada diferença vira uma movimentação "Inventário". */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ countId: string }> },
) {
  const auth = await requireOrganization();
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { countId } = await params;
  try {
    const result = await approveStockCount({
      organizationId: auth.ctx.organizationId,
      countId,
      mlUserId: auth.ctx.userId,
    });
    return NextResponse.json({ ok: true, adjusted: result.adjusted });
  } catch (e) {
    return stockActionErrorResponse("api/stock/counts/[countId]/approve POST", e);
  }
}
