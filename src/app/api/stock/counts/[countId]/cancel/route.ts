import { NextResponse } from "next/server";
import { requireOrganization } from "@/lib/api/api-auth";
import { stockActionErrorResponse } from "@/lib/stock/stock-api-errors";
import { cancelStockCount } from "@/lib/stock/stock-counts";

/** Cancela um inventário ainda não aprovado (nada muda no estoque). */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ countId: string }> },
) {
  const auth = await requireOrganization();
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { countId } = await params;
  try {
    await cancelStockCount(auth.ctx.organizationId, countId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return stockActionErrorResponse("api/stock/counts/[countId]/cancel POST", e);
  }
}
