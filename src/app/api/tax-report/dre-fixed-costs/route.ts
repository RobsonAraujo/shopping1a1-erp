import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  importDreFixedCosts,
  loadDreFixedCostSuggestions,
} from "@/lib/tax-report/dre-fixed-cost-import";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { requireOrganization } from "@/lib/api/api-auth";
import { parseJsonBody } from "@/lib/api/api-validation";

const importSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  dreCostItemIds: z.array(z.string().trim().min(1)).min(1).max(100),
});

export async function GET(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const year = Number(request.nextUrl.searchParams.get("year"));
  const month = Number(request.nextUrl.searchParams.get("month"));
  if (
    !Number.isInteger(year) ||
    year < 2000 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return NextResponse.json(
      { error: "year e month são obrigatórios" },
      { status: 400 },
    );
  }

  try {
    const items = await loadDreFixedCostSuggestions(
      auth.ctx.organizationId,
      year,
      month,
    );
    return NextResponse.json({ items });
  } catch (e) {
    logServerError("api/tax-report/dre-fixed-costs GET", e);
    return NextResponse.json(
      apiErrorPayload(e, "tax_dre_fixed_costs_failed"),
      { status: 502 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const parsedBody = await parseJsonBody(request, importSchema);
  if (!parsedBody.ok) return parsedBody.response;
  const { year, month, dreCostItemIds } = parsedBody.data;

  try {
    const result = await importDreFixedCosts(
      auth.ctx.organizationId,
      year,
      month,
      dreCostItemIds,
    );
    return NextResponse.json(result);
  } catch (e) {
    logServerError("api/tax-report/dre-fixed-costs POST", e);
    return NextResponse.json(
      apiErrorPayload(e, "tax_dre_fixed_costs_import_failed"),
      { status: 502 },
    );
  }
}
