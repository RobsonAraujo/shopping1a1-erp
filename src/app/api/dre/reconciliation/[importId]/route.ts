import { NextRequest, NextResponse } from "next/server";
import { requireOrganization } from "@/lib/api/api-auth";
import { discardReconciliationImport } from "@/lib/dre/reconciliation/reconciliation-data";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ importId: string }> },
) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { importId } = await context.params;
  try {
    const result = await discardReconciliationImport({
      organizationId: auth.ctx.organizationId,
      importId,
    });
    return NextResponse.json({ year: result.year });
  } catch (error) {
    logServerError("api/dre/reconciliation DELETE", error);
    return NextResponse.json(
      apiErrorPayload(error, "dre_reconciliation_discard_failed"),
      { status: 502 },
    );
  }
}
