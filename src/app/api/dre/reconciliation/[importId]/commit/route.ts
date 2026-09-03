import { NextRequest, NextResponse } from "next/server";
import { requireOrganization } from "@/lib/api/api-auth";
import { commitReconciliationImport } from "@/lib/dre/reconciliation/reconciliation-data";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ importId: string }> },
) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { importId } = await context.params;
  try {
    const result = await commitReconciliationImport({
      organizationId: auth.ctx.organizationId,
      importId,
    });
    return NextResponse.json({ year: result.year });
  } catch (error) {
    logServerError("api/dre/reconciliation/commit POST", error);
    return NextResponse.json(
      apiErrorPayload(error, "dre_reconciliation_commit_failed"),
      { status: 502 },
    );
  }
}
