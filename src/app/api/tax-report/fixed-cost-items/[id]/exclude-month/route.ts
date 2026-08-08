import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { excludeTaxFixedCostMonth } from "@/lib/tax-report/tax-fixed-cost-data";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import {
  getValidAccessToken,
  readSession,
} from "@/lib/mercadolibre/session";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);
  const { userId } = readSession(cookieStore);
  if (!token || userId === undefined) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  let body: { year?: number; month?: number };
  try {
    body = (await request.json()) as { year?: number; month?: number };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const year = Number(body.year);
  const month = Number(body.month);
  if (
    !Number.isInteger(year) ||
    year < 2000 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return NextResponse.json({ error: "Invalid year/month" }, { status: 400 });
  }

  try {
    await excludeTaxFixedCostMonth(id, year, month);
    return NextResponse.json({ ok: true });
  } catch (e) {
    logServerError("api/tax-report/fixed-cost-items/[id]/exclude-month POST", e);
    return NextResponse.json(
      apiErrorPayload(e, "tax_fixed_cost_month_exclude_failed"),
      { status: 502 },
    );
  }
}
