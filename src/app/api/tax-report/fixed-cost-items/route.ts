import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  createTaxFixedCostItem,
  loadTaxFixedCostItemsWithMonthValue,
} from "@/lib/tax-report/tax-fixed-cost-data";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import {
  getValidAccessToken,
  readSession,
} from "@/lib/mercadolibre/session";

async function requireAuth() {
  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);
  const { userId } = readSession(cookieStore);
  if (!token || userId === undefined) {
    return null;
  }
  return true;
}

export async function GET(request: NextRequest) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    const items = await loadTaxFixedCostItemsWithMonthValue(year, month);
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
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    name?: string;
    recurring?: boolean;
    amount?: number | null;
    year?: number;
    month?: number;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  const recurring = body.recurring !== false;

  let initialAmount: { year: number; month: number; amount: number } | null = null;
  if (body.amount !== undefined && body.amount !== null) {
    const year = Number(body.year);
    const month = Number(body.month);
    if (
      typeof body.amount !== "number" ||
      !Number.isFinite(body.amount) ||
      body.amount < 0 ||
      !Number.isInteger(year) ||
      year < 2000 ||
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12
    ) {
      return NextResponse.json({ error: "Invalid amount/year/month" }, { status: 400 });
    }
    initialAmount = { year, month, amount: body.amount };
  }

  try {
    const item = await createTaxFixedCostItem(name, recurring, initialAmount);
    return NextResponse.json({ item });
  } catch (e) {
    logServerError("api/tax-report/fixed-cost-items POST", e);
    return NextResponse.json(
      apiErrorPayload(e, "tax_fixed_cost_item_create_failed"),
      { status: 502 },
    );
  }
}
