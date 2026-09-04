import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mergeSupplierRevenueIntoRows,
  sumSupplierRevenue,
  filterRowsBySupplier,
  buildSupplierSummaries,
  type PurchaseAnalysisItemRow,
} from "../purchase-analysis-rows";
import type { PurchaseAnalysisResult, PurchaseStatus, PurchasePerformanceTier } from "../purchase-analysis";

function row(overrides: Partial<PurchaseAnalysisItemRow> = {}): PurchaseAnalysisItemRow {
  return {
    item: { id: "MLB1", title: "Item", status: "active" } as PurchaseAnalysisItemRow["item"],
    sku: "SKU-1",
    supplier: "MXT",
    mlStock: 0,
    warehouseStock: 0,
    totalStock: 0,
    unitsSold: 0,
    purchaseLeadTimeDays: 0,
    plan: {
      stockWillLast: "",
      searchStartsOn: null,
      activeStockOn: null,
      purchaseStartsOn: null,
      searchIsOverdue: false,
      purchaseIsOverdue: false,
      searchStartsAtMs: null,
      purchaseStartsAtMs: null,
      needsSchedulingAttention: false,
      needsPurchaseAttention: false,
      tooltips: { stockWillLast: "", search: "", activeStock: "", purchase: "" },
    },
    analysis: {
      performanceTier: "zero" as PurchasePerformanceTier,
      performanceTooltip: "",
      purchaseStatus: "sem_vendas" as PurchaseStatus,
      statusTooltip: "",
      recommendation: "nao_repor",
      suggestedQty: 0,
      dailyAvg: 0,
      coverageDays: null,
      unitsSoldInWindow: 0,
      targetDays: 0,
      recommendationTooltip: "",
    } as PurchaseAnalysisResult,
    catalogStatus: null,
    categoryName: null,
    categoryPath: null,
    revenueLastMonth: 0,
    revenueCurrentMonth: 0,
    unitsSoldLastMonth: 0,
    unitsSoldCurrentMonth: 0,
    targetCoverageDays: null,
    ...overrides,
  };
}

describe("mergeSupplierRevenueIntoRows", () => {
  it("merges revenue/units maps by item id, defaulting missing entries to 0", () => {
    const rows = [row({ item: { id: "MLB1" } as PurchaseAnalysisItemRow["item"] })];
    const merged = mergeSupplierRevenueIntoRows(
      rows,
      { MLB1: 100 },
      { MLB1: 50 },
      { MLB1: 3 },
      {},
    );
    assert.equal(merged[0].revenueLastMonth, 100);
    assert.equal(merged[0].revenueCurrentMonth, 50);
    assert.equal(merged[0].unitsSoldLastMonth, 3);
    assert.equal(merged[0].unitsSoldCurrentMonth, 0);
  });

  it("does not mutate the original rows array", () => {
    const rows = [row()];
    mergeSupplierRevenueIntoRows(rows, {}, {});
    assert.equal(rows[0].revenueLastMonth, 0);
  });
});

describe("sumSupplierRevenue", () => {
  it("sums lastMonth/currentMonth revenue across rows", () => {
    const rows = [
      row({ revenueLastMonth: 10, revenueCurrentMonth: 5 }),
      row({ revenueLastMonth: 20, revenueCurrentMonth: 15 }),
    ];
    assert.deepEqual(sumSupplierRevenue(rows), { lastMonth: 30, currentMonth: 20 });
  });

  it("returns zeros for an empty list", () => {
    assert.deepEqual(sumSupplierRevenue([]), { lastMonth: 0, currentMonth: 0 });
  });
});

describe("filterRowsBySupplier", () => {
  it("filters rows to the decoded supplier param", () => {
    const rows = [
      row({ supplier: "MXT & Cia" }),
      row({ supplier: "Aquario" }),
    ];
    const result = filterRowsBySupplier(rows, encodeURIComponent("MXT & Cia"));
    assert.equal(result.length, 1);
    assert.equal(result[0].supplier, "MXT & Cia");
  });

  it("sorts matched rows by overdue/unitsSold/suggestedQty", () => {
    const rows = [
      row({
        supplier: "MXT",
        unitsSold: 5,
        plan: { ...row().plan, purchaseIsOverdue: false },
        analysis: { ...row().analysis, suggestedQty: 1 },
      }),
      row({
        supplier: "MXT",
        unitsSold: 1,
        plan: { ...row().plan, purchaseIsOverdue: true },
        analysis: { ...row().analysis, suggestedQty: 1 },
      }),
    ];
    const result = filterRowsBySupplier(rows, "MXT");
    assert.equal(result[0].plan.purchaseIsOverdue, true);
  });
});

describe("buildSupplierSummaries", () => {
  it("groups by supplier and counts urgent/highRotation/noSales", () => {
    const rows = [
      row({
        supplier: "MXT",
        analysis: { ...row().analysis, purchaseStatus: "urgente", performanceTier: "zero" },
      }),
      row({
        supplier: "MXT",
        analysis: { ...row().analysis, performanceTier: "alta", purchaseStatus: "ok" },
      }),
      row({ supplier: "Aquario" }),
    ];
    const summaries = buildSupplierSummaries(rows, () => true);
    const mxt = summaries.find((s) => s.supplier === "MXT");
    assert.ok(mxt);
    assert.equal(mxt.totalProducts, 2);
    assert.equal(mxt.urgentCount, 1);
    assert.equal(mxt.highRotationCount, 1);
    assert.equal(mxt.noSalesCount, 1);
  });

  it("sums suggestedQty only for rows recommended to buy", () => {
    const rows = [
      row({
        supplier: "MXT",
        analysis: { ...row().analysis, recommendation: "comprar", suggestedQty: 10 },
      }),
      row({
        supplier: "MXT",
        analysis: { ...row().analysis, recommendation: "nao_repor", suggestedQty: 999 },
      }),
    ];
    const summaries = buildSupplierSummaries(rows, () => false);
    assert.equal(summaries[0].suggestedUnitsTotal, 10);
  });

  it("sorts suppliers with active alerts first, then by urgent count, then alphabetically", () => {
    const rows = [
      row({ supplier: "Zebra", analysis: { ...row().analysis, purchaseStatus: "ok" } }),
      row({ supplier: "Aquario", analysis: { ...row().analysis, purchaseStatus: "urgente" } }),
    ];
    const summaries = buildSupplierSummaries(rows, (r) => r.analysis.purchaseStatus === "urgente");
    assert.equal(summaries[0].supplier, "Aquario");
    assert.equal(summaries[0].hasActiveAlert, true);
  });

  it("returns an empty array for no rows", () => {
    assert.deepEqual(buildSupplierSummaries([], () => false), []);
  });
});
