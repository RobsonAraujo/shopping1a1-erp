import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  deactivateTaxFixedCostItem,
  endTaxFixedCostItem,
  updateTaxFixedCostItem,
} from "@/lib/tax-report/tax-fixed-cost-data";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import {
  getValidAccessToken,
  readSession,
} from "@/lib/mercadolibre/session";

type RouteContext = { params: Promise<{ id: string }> };

async function requireAuth() {
  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);
  const { userId } = readSession(cookieStore);
  if (!token || userId === undefined) {
    return null;
  }
  return true;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  let body: {
    name?: string;
    recurring?: boolean;
    end?: { year?: number; month?: number };
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.end) {
    const year = Number(body.end.year);
    const month = Number(body.end.month);
    if (
      !Number.isInteger(year) ||
      year < 2000 ||
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12
    ) {
      return NextResponse.json({ error: "Invalid end year/month" }, { status: 400 });
    }
    try {
      const item = await endTaxFixedCostItem(id, year, month);
      return NextResponse.json({ item });
    } catch (e) {
      logServerError("api/tax-report/fixed-cost-items PATCH (end)", e);
      return NextResponse.json(
        apiErrorPayload(e, "tax_fixed_cost_item_end_failed"),
        { status: 502 },
      );
    }
  }

  const update: { name?: string; recurring?: boolean } = {};
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    update.name = name;
  }
  if (body.recurring !== undefined) {
    update.recurring = Boolean(body.recurring);
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  try {
    const item = await updateTaxFixedCostItem(id, update);
    return NextResponse.json({ item });
  } catch (e) {
    logServerError("api/tax-report/fixed-cost-items PATCH", e);
    return NextResponse.json(
      apiErrorPayload(e, "tax_fixed_cost_item_update_failed"),
      { status: 502 },
    );
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    await deactivateTaxFixedCostItem(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    logServerError("api/tax-report/fixed-cost-items DELETE", e);
    return NextResponse.json(
      apiErrorPayload(e, "tax_fixed_cost_item_delete_failed"),
      { status: 502 },
    );
  }
}
