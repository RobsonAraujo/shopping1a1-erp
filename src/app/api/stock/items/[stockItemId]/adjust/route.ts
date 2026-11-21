import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrganization } from "@/lib/api/api-auth";
import { parseJsonBody } from "@/lib/api/api-validation";
import { recordManualStockChange } from "@/lib/stock/stock-actions";
import { stockActionErrorResponse } from "@/lib/stock/stock-api-errors";

const bodySchema = z.object({
  kind: z.enum(["adjustment", "full_return"]),
  /** Ajuste: com sinal (+ entra, − sai). Voltou do Full: unidades que voltaram. */
  quantity: z.number().int().min(-10_000_000).max(10_000_000).refine((n) => n !== 0),
  reason: z.string().trim().min(1).max(120),
  note: z.string().max(1000).nullable().optional(),
});

/** Ajuste de saldo ou "Voltou do Full" de um item de estoque (saídas vão por `/api/stock/exits`). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ stockItemId: string }> },
) {
  const auth = await requireOrganization();
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { userId, organizationId } = auth.ctx;
  const { stockItemId } = await params;

  const parsed = await parseJsonBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;
  try {
    await recordManualStockChange({
      organizationId,
      mlUserId: userId,
      stockItemId,
      kind: parsed.data.kind,
      quantity: parsed.data.quantity,
      reason: parsed.data.reason,
      note: parsed.data.note ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return stockActionErrorResponse("api/stock/items/[stockItemId]/adjust POST", e);
  }
}
