import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  loadTaxFixedCostItemsWithMonthValue,
  upsertTaxFixedCostMonthValue,
} from "@/lib/tax-report/tax-fixed-cost-data";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { requireAuth, unauthorizedResponse } from "@/lib/api-auth";
import { parseJsonBody } from "@/lib/api-validation";

const fixedCostValueSchema = z.object({
  costItemId: z.string().trim().min(1),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  amount: z.number().finite().min(0).nullish(),
});

export async function PUT(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth) return unauthorizedResponse();

  const parsedBody = await parseJsonBody(request, fixedCostValueSchema);
  if (!parsedBody.ok) return parsedBody.response;
  const { costItemId, year, month, amount } = parsedBody.data;

  try {
    await upsertTaxFixedCostMonthValue({
      costItemId,
      year,
      month,
      amount: amount ?? null,
    });
    const items = await loadTaxFixedCostItemsWithMonthValue(year, month);
    return NextResponse.json({ items });
  } catch (e) {
    logServerError("api/tax-report/fixed-cost-values PUT", e);
    return NextResponse.json(
      apiErrorPayload(e, "tax_fixed_cost_value_failed"),
      { status: 502 },
    );
  }
}
