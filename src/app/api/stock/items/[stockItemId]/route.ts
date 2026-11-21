import { NextResponse } from "next/server";
import { requireOrganization } from "@/lib/api/api-auth";
import { logServerError } from "@/lib/infra/server-public-error";
import { loadStockItemDetail } from "@/lib/stock/stock-page-data";

/** Gaveta do produto: lotes de custo e últimas movimentações. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ stockItemId: string }> },
) {
  const auth = await requireOrganization();
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { stockItemId } = await params;
  try {
    const detail = await loadStockItemDetail(auth.ctx.organizationId, stockItemId);
    if (!detail) return NextResponse.json({ error: "stock_item_not_found" }, { status: 404 });
    return NextResponse.json(detail);
  } catch (e) {
    logServerError("api/stock/items/[stockItemId] GET", e);
    return NextResponse.json({ error: "stock_action_failed" }, { status: 500 });
  }
}
