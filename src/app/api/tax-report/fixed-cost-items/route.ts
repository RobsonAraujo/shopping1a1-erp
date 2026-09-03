import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createTaxFixedCostItem,
  loadTaxFixedCostItemsWithMonthValue,
} from "@/lib/tax-report/tax-fixed-cost-data";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { requireOrganization } from "@/lib/api/api-auth";
import { parseJsonBody } from "@/lib/api/api-validation";

const createFixedCostItemSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required"),
    recurring: z.boolean().default(true),
    amount: z.number().finite().min(0).nullish(),
    year: z.number().int().min(2000).optional(),
    month: z.number().int().min(1).max(12).optional(),
  })
  .refine(
    (body) =>
      body.amount === undefined ||
      body.amount === null ||
      (body.year !== undefined && body.month !== undefined),
    { error: "Invalid amount/year/month" },
  );

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
    const items = await loadTaxFixedCostItemsWithMonthValue(
      auth.ctx.organizationId,
      year,
      month,
    );
    return NextResponse.json({ items });
  } catch (e) {
    logServerError("api/tax-report/fixed-cost-items GET", e);
    return NextResponse.json(
      apiErrorPayload(e, "tax_fixed_cost_items_failed"),
      { status: 502 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const parsedBody = await parseJsonBody(request, createFixedCostItemSchema);
  if (!parsedBody.ok) return parsedBody.response;
  const { name, recurring, amount, year, month } = parsedBody.data;

  const initialAmount =
    amount !== undefined && amount !== null
      ? { year: year!, month: month!, amount }
      : null;

  try {
    const item = await createTaxFixedCostItem(
      auth.ctx.organizationId,
      name,
      recurring,
      initialAmount,
    );
    return NextResponse.json({ item });
  } catch (e) {
    logServerError("api/tax-report/fixed-cost-items POST", e);
    return NextResponse.json(
      apiErrorPayload(e, "tax_fixed_cost_item_create_failed"),
      { status: 502 },
    );
  }
}
