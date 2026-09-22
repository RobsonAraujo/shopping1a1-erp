import { NextResponse } from "next/server";
import { requireOrganization } from "@/lib/api/api-auth";
import { triggerManualInventoryMonthSnapshot } from "@/lib/inventory/inventory-month-snapshot";
import { logServerError } from "@/lib/infra/server-public-error";

// Inclui a busca de estoque Full em processamento (1 chamada ML por item
// Full, sem streaming aqui) — pode demorar mais que uma rota comum em
// organizações com muitos itens Full.
export const maxDuration = 180;

export async function POST() {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  try {
    const result = await triggerManualInventoryMonthSnapshot(
      auth.ctx.organizationId,
    );
    if (!result.ok) {
      return NextResponse.json(result, { status: 502 });
    }
    return NextResponse.json(result);
  } catch (e) {
    logServerError("api/inventory/month-snapshot/manual POST", e);
    return NextResponse.json(
      { ok: false, error: "manual_snapshot_failed" },
      { status: 502 },
    );
  }
}
