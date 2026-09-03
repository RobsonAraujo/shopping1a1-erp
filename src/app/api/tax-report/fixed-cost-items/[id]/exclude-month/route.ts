import { NextRequest, NextResponse } from "next/server";
import { excludeTaxFixedCostMonth } from "@/lib/tax-report/tax-fixed-cost-data";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { requireOrganization } from "@/lib/api/api-auth";
import { parseJsonBody, yearMonthSchema } from "@/lib/api/api-validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const { id } = await context.params;
  const parsedBody = await parseJsonBody(request, yearMonthSchema);
  if (!parsedBody.ok) return parsedBody.response;
  const { year, month } = parsedBody.data;

  try {
    await excludeTaxFixedCostMonth(auth.ctx.organizationId, id, year, month);
    return NextResponse.json({ ok: true });
  } catch (e) {
    logServerError("api/tax-report/fixed-cost-items/[id]/exclude-month POST", e);
    return NextResponse.json(
      apiErrorPayload(e, "tax_fixed_cost_month_exclude_failed"),
      { status: 502 },
    );
  }
}
