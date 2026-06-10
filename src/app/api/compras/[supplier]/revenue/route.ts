import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { fetchRevenueByItemForCalendarMonths } from "@/lib/mercadolibre/api";
import {
  getValidAccessToken,
  readSession,
} from "@/lib/mercadolibre/session";
import { sumRevenueForItems } from "@/lib/mercadolibre/revenue-periods";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";

type RouteContext = {
  params: Promise<{ supplier: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  await context.params;

  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);
  const { userId } = readSession(cookieStore);

  if (!token || userId === undefined) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const itemIdsParam = request.nextUrl.searchParams.get("itemIds") ?? "";
  const itemIds = itemIdsParam
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (itemIds.length === 0) {
    return NextResponse.json(
      { error: "itemIds query parameter is required" },
      { status: 400 },
    );
  }

  try {
    const revenue = await fetchRevenueByItemForCalendarMonths(token, userId);

    return NextResponse.json({
      monthLabels: revenue.monthLabels,
      lastMonth: Object.fromEntries(
        itemIds.map((id) => [id, revenue.lastMonth[id] ?? 0]),
      ),
      currentMonth: Object.fromEntries(
        itemIds.map((id) => [id, revenue.currentMonth[id] ?? 0]),
      ),
      totals: {
        lastMonth: sumRevenueForItems(revenue.lastMonth, itemIds),
        currentMonth: sumRevenueForItems(revenue.currentMonth, itemIds),
      },
    });
  } catch (e) {
    logServerError("api/compras/[supplier]/revenue", e);
    return NextResponse.json(apiErrorPayload(e, "supplier_revenue_failed"), {
      status: 500,
    });
  }
}
