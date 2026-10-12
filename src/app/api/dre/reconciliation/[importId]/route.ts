import { NextRequest, NextResponse } from "next/server";
import { requireOrganization } from "@/lib/api/api-auth";
import {
  DreReconciliationError,
  discardReconciliationImport,
  getReconciliationReview,
} from "@/lib/dre/reconciliation/reconciliation-data";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";

/** Revisão de um import salvo (sem novo upload) contra o DRE atual. */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ importId: string }> },
) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { importId } = await context.params;
  try {
    const review = await getReconciliationReview({
      organizationId: auth.ctx.organizationId,
      importId,
    });
    return NextResponse.json(review);
  } catch (error) {
    if (error instanceof DreReconciliationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    logServerError("api/dre/reconciliation GET", error);
    return NextResponse.json(
      apiErrorPayload(error, "dre_reconciliation_review_failed"),
      { status: 502 },
    );
  }
}

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
    if (error instanceof DreReconciliationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    logServerError("api/dre/reconciliation DELETE", error);
    return NextResponse.json(
      apiErrorPayload(error, "dre_reconciliation_discard_failed"),
      { status: 502 },
    );
  }
}
