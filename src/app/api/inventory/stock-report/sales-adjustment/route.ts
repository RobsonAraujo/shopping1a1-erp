import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { stockPlanningConfig } from "@/config/stock-planning";
import { loadCatalogMlStockAtOrBefore } from "@/lib/catalog-snapshot-stock";
import { fetchUnitsSoldForItemsInDateRangeBatched } from "@/lib/mercadolibre/api";
import {
  parseStockReportSnapshotDateInput,
  stockReportSalesAdjustmentRange,
} from "@/lib/inventory-stock-report";
import { prisma } from "@/lib/db";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import {
  getValidAccessToken,
  readSession,
} from "@/lib/mercadolibre/session";

function parseItemIds(value: string | null): string[] {
  if (!value?.trim()) return [];
  return [...new Set(value.split(",").map((id) => id.trim()).filter(Boolean))];
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);
  const { userId } = readSession(cookieStore);

  if (!token || userId === undefined) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const snapshotParam = request.nextUrl.searchParams.get("snapshot");
  const itemIds = parseItemIds(request.nextUrl.searchParams.get("itemIds"));
  const catalogItemIdsFromClient = parseItemIds(
    request.nextUrl.searchParams.get("catalogItemIds"),
  );

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
      catalogSnapshotByMlItemId: {},
      dateField: stockPlanningConfig.salesWindowDateField,
    });
  }

  try {
    const listings = await prisma.listing.findMany({
      where: { mlItemId: { in: itemIds } },
      select: { mlItemId: true, catalogListing: true },
    });
    const catalogById = Object.fromEntries(
      listings.map((row) => [row.mlItemId, row.catalogListing === true]),
    );
    for (const id of catalogItemIdsFromClient) {
      catalogById[id] = true;
    }

    const catalogItemIds = itemIds.filter((id) => catalogById[id] === true);
    const catalogSnapshots = await loadCatalogMlStockAtOrBefore(
      catalogItemIds,
      snapshotDate,
    );

    const catalogSnapshotByMlItemId: Record<
      string,
      { mlStock: number; snapshotAt: string }
    > = {};
    for (const [mlItemId, snap] of catalogSnapshots) {
      catalogSnapshotByMlItemId[mlItemId] = {
        mlStock: snap.mlStock,
        snapshotAt: snap.snapshotAt.toISOString(),
      };
    }

    const salesItemIds = itemIds.filter((id) => !catalogSnapshots.has(id));
    const period = stockReportSalesAdjustmentRange(snapshotDate);
    const dateField = stockPlanningConfig.salesWindowDateField;

    let salesByMlItemId: Record<string, number> = {};
    if (period && salesItemIds.length > 0) {
      salesByMlItemId = await fetchUnitsSoldForItemsInDateRangeBatched(
        token,
        userId,
        salesItemIds,
        period.from,
        period.to,
        dateField,
      );
    }

    return NextResponse.json({
      period: period
        ? { from: period.from.toISOString(), to: period.to.toISOString() }
        : null,
      salesByMlItemId,
      catalogSnapshotByMlItemId,
      dateField,
    });
  } catch (e) {
    logServerError("api/inventory/stock-report/sales-adjustment GET", e);
    return NextResponse.json(
      apiErrorPayload(e, "stock_report_sales_adjustment_failed"),
      { status: 502 },
    );
  }
}
