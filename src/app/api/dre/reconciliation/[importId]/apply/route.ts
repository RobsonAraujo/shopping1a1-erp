import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  DRE_EDITABLE_LINE_KEYS,
  type DreEditableLineKey,
} from "@/lib/dre/dre-calculations";
import { requireOrganization } from "@/lib/api/api-auth";
import { parseJsonBody } from "@/lib/api/api-validation";
import { applyReconciliationImport } from "@/lib/dre/reconciliation/reconciliation-data";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";

const applySchema = z.object({
  acceptedLineKeys: z.array(
    z.enum(
      DRE_EDITABLE_LINE_KEYS as unknown as [
        DreEditableLineKey,
        ...DreEditableLineKey[],
      ],
    ),
  ),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ importId: string }> },
) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { importId } = await context.params;
  const parsedBody = await parseJsonBody(request, applySchema);
  if (!parsedBody.ok) return parsedBody.response;

  try {
    const result = await applyReconciliationImport({
      organizationId: auth.ctx.organizationId,
      importId,
      acceptedLineKeys: parsedBody.data.acceptedLineKeys,
    });
    return NextResponse.json({ year: result.year });
  } catch (error) {
    logServerError("api/dre/reconciliation/apply POST", error);
    return NextResponse.json(
      apiErrorPayload(error, "dre_reconciliation_apply_failed"),
      { status: 502 },
    );
  }
}
