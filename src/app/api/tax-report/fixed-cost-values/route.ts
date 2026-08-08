import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  loadTaxFixedCostItemsWithMonthValue,
  upsertTaxFixedCostMonthValue,
} from "@/lib/tax-report/tax-fixed-cost-data";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import {
  getValidAccessToken,
  readSession,
} from "@/lib/mercadolibre/session";

export async function PUT(request: NextRequest) {
  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);
  const { userId } = readSession(cookieStore);

  if (!token || userId === undefined) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    costItemId?: string;
    year?: number;
    month?: number;
    amount?: number | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const costItemId = body.costItemId?.trim();
  const year = Number(body.year);
  const month = Number(body.month);
  const amount = body.amount;

  if (
    !costItemId ||
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 2100 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (amount !== null && amount !== undefined) {
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }
  }

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
