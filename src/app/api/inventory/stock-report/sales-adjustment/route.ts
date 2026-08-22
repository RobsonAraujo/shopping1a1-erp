import { NextRequest, NextResponse } from "next/server";
import { stockPlanningConfig } from "@/config/stock-planning";
import { fetchUnitsSoldForItemsInDateRangeBatched } from "@/lib/mercadolibre/api";
import {
  parseStockReportSnapshotDateInput,
  stockReportSalesAdjustmentRange,
} from "@/lib/inventory/inventory-stock-report";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { requireOrganization } from "@/lib/api-auth";

function parseItemIds(value: string | null): string[] {
  if (!value?.trim()) return [];
  return [
    ...new Set(
      value
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];
}

export async function GET(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { token, userId } = auth.ctx;

  const snapshotParam = request.nextUrl.searchParams.get("snapshot");
  const itemIds = parseItemIds(request.nextUrl.searchParams.get("itemIds"));

  if (!snapshotParam) {
    return NextResponse.json(
      { error: "snapshot query param required (YYYY-MM-DD)" },
      { status: 400 },
    );
  }

  const snapshotDate = parseStockReportSnapshotDateInput(snapshotParam);
  if (!snapshotDate) {
    return NextResponse.json(
      { error: "Invalid snapshot date (expected YYYY-MM-DD)" },
      { status: 400 },
    );
  }

  if (itemIds.length === 0) {
    return NextResponse.json({
      period: null,
      salesByMlItemId: {},
      dateField: stockPlanningConfig.salesWindowDateField,
    });
  }

  try {
    const period = stockReportSalesAdjustmentRange(snapshotDate);
    const dateField = stockPlanningConfig.salesWindowDateField;
    const includeCancelled =
      request.nextUrl.searchParams.get("includeCancelled") === "true";

    let salesByMlItemId: Record<string, number> = {};
    if (period && itemIds.length > 0) {
      salesByMlItemId = await fetchUnitsSoldForItemsInDateRangeBatched(
        token,
        userId,
        itemIds,
        period.from,
        period.to,
        dateField,
        12,
        { includeCancelled },
      );
    }

    return NextResponse.json({
      period: period
        ? { from: period.from.toISOString(), to: period.to.toISOString() }
        : null,
      salesByMlItemId,
      dateField,
      includeCancelled,
    });
  } catch (e) {
    logServerError("api/inventory/stock-report/sales-adjustment GET", e);
    return NextResponse.json(
      apiErrorPayload(e, "stock_report_sales_adjustment_failed"),
      { status: 502 },
    );
  }
}
