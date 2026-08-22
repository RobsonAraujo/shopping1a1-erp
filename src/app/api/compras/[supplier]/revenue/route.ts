import { NextRequest, NextResponse } from "next/server";
import { fetchItemOrderMetricsForCalendarMonths } from "@/lib/mercadolibre/api";
import { requireOrganization } from "@/lib/api-auth";
import {
  sumRevenueForItems,
  sumUnitsForItems,
} from "@/lib/mercadolibre/revenue-periods";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";

type RouteContext = {
  params: Promise<{ supplier: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  await context.params;

  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { token, userId } = auth.ctx;

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
    const metrics = await fetchItemOrderMetricsForCalendarMonths(token, userId);

    return NextResponse.json({
      monthLabels: metrics.monthLabels,
      lastMonth: Object.fromEntries(
        itemIds.map((id) => [id, metrics.revenueLastMonth[id] ?? 0]),
      ),
      currentMonth: Object.fromEntries(
        itemIds.map((id) => [id, metrics.revenueCurrentMonth[id] ?? 0]),
      ),
      unitsLastMonth: Object.fromEntries(
        itemIds.map((id) => [id, metrics.unitsLastMonth[id] ?? 0]),
      ),
      unitsCurrentMonth: Object.fromEntries(
        itemIds.map((id) => [id, metrics.unitsCurrentMonth[id] ?? 0]),
      ),
      totals: {
        lastMonth: sumRevenueForItems(metrics.revenueLastMonth, itemIds),
        currentMonth: sumRevenueForItems(metrics.revenueCurrentMonth, itemIds),
        unitsLastMonth: sumUnitsForItems(metrics.unitsLastMonth, itemIds),
        unitsCurrentMonth: sumUnitsForItems(metrics.unitsCurrentMonth, itemIds),
      },
    });
  } catch (e) {
    logServerError("api/compras/[supplier]/revenue", e);
    return NextResponse.json(apiErrorPayload(e, "supplier_revenue_failed"), {
      status: 500,
    });
  }
}
