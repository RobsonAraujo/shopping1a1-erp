import { NextResponse } from "next/server";
import { requireOrganization } from "@/lib/api/api-auth";
import { reverseStockEntry } from "@/lib/stock/stock-actions";
import { stockActionErrorResponse } from "@/lib/stock/stock-api-errors";

/** Estorna uma entrada lançada por engano (só se nada dela foi vendido). */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ entryId: string }> },
) {
  const auth = await requireOrganization();
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { userId, organizationId } = auth.ctx;
  const { entryId } = await params;
  try {
    await reverseStockEntry({ organizationId, mlUserId: userId, entryId });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return stockActionErrorResponse("api/stock/entries/[entryId]/reverse POST", e);
  }
}
