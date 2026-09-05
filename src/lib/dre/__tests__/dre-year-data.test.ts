import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildEffectiveCostMaps,
  buildMonthTotals,
  buildYearTotals,
  type DreCostItemView,
  type DreMonthView,
} from "../dre-year-data";
import type { DreLineAmounts, DreMonthSnapshotPayload } from "../dre-calculations";

const BASE_LINES: DreLineAmounts = {
  revenueMl: 0,
  cancelledSalesMl: 0,
  saleFeeMl: 0,
  partialReturnsMl: 0,
  returnFeeMl: 0,
  specialFeesMl: 0,
  productCostErp: 0,
  taxErp: 0,
  sellerShippingMl: 0,
  fullShippingMl: 0,
  fullStorageMl: 0,
  fullNonComplianceMl: 0,
  minhaPaginaMl: 0,
  affiliateFeeMl: 0,
};

function payload(overrides: Partial<DreMonthSnapshotPayload> = {}): DreMonthSnapshotPayload {
  return {
    ...BASE_LINES,
    adsCost: 0,
    billingSource: "billing",
    isPartial: false,
    incompleteProductCostCount: 0,
    syncWarnings: [],
    ...overrides,
  };
}

function costItem(overrides: Partial<DreCostItemView> = {}): DreCostItemView {
  return { id: "c1", name: "Aluguel", sortOrder: 1, recurring: true, ...overrides };
}

function month(overrides: Partial<DreMonthView> = {}): DreMonthView {
  return {
    month: 1,
    label: "Jan",
    isCurrentMonth: false,
    isFutureMonth: false,
    canSync: true,
    syncedAt: null,
    billingSource: null,
    isPartial: false,
    incompleteProductCostCount: 0,
    syncWarnings: [],
    lines: null,
    cancelledIncludeOverlay: null,
    productCostBreakdown: null,
    taxBreakdown: null,
    revenueBreakdown: null,
    cancelledSalesBreakdown: null,
    saleFeeBreakdown: null,
    sellerShippingBreakdown: null,
    adsCostBreakdown: null,
    partialReturnsBreakdown: null,
    returnFeeBreakdown: null,
    specialFeesBreakdown: null,
    fullShippingBreakdown: null,
    fullStorageBreakdown: null,
    fullNonComplianceBreakdown: null,
    minhaPaginaBreakdown: null,
    affiliateFeeBreakdown: null,
    pendingReconciliationImportId: null,
    pendingReconciliationApplied: false,
    fullReportSourced: false,
    adsCost: null,
    manuallyEditedLineKeys: [],
    syncedLineBaselineKeys: [],
    fixedCostValues: {},
    fixedCostOverrides: {},
    operationalCostValues: {},
    operationalCostOverrides: {},
    investmentCostValues: {},
    investmentCostOverrides: {},
    nonOperationalOutValues: {},
    nonOperationalOutOverrides: {},
    nonOperationalInValues: {},
    nonOperationalInOverrides: {},
    totals: null,
    ...overrides,
  };
}

describe("buildMonthTotals", () => {
  it("returns null when there's no snapshot and no manual cost above zero", () => {
    const totals = buildMonthTotals(null, null, [costItem()], [], [], [], [], {}, {}, {}, {}, {});
    assert.equal(totals, null);
  });

  it("computes totals from a synced snapshot's lines and adsCost", () => {
    const p = payload({ revenueMl: 1000, saleFeeMl: -50, adsCost: 20 });
    const totals = buildMonthTotals(
      p,
      { ...BASE_LINES, revenueMl: 1000, saleFeeMl: -50 },
      [],
      [],
      [],
      [],
      [],
      {},
      {},
      {},
      {},
      {},
    );
    assert.ok(totals);
    assert.equal(totals.totalEntrada, 1000);
    assert.equal(totals.adsCost, 20);
  });

  it("falls back to a manual-only computation (zeroed ML lines) when no snapshot exists yet but a fixed cost was entered", () => {
    const totals = buildMonthTotals(
      null,
      null,
      [costItem({ id: "rent" })],
      [],
      [],
      [],
      [],
      { rent: 500 },
      {},
      {},
      {},
      {},
    );
    assert.ok(totals);
    assert.equal(totals.totalEntrada, 0);
    assert.equal(totals.totalCustoFixoManual, 500);
  });

  it("ignores non-positive manual cost values when deciding whether a manual-only month exists", () => {
    const totals = buildMonthTotals(
      null,
      null,
      [costItem({ id: "rent" })],
      [],
      [],
      [],
      [],
      { rent: 0 },
      {},
      {},
      {},
      {},
    );
    assert.equal(totals, null);
  });

  it("treats a snapshot with null lines the same as no snapshot at all", () => {
    // Defensive: payload present but lines somehow null — must not throw,
    // must follow the manual-only branch just like payload === null.
    const totals = buildMonthTotals(
      payload(),
      null,
      [costItem({ id: "rent" })],
      [],
      [],
      [],
      [],
      { rent: 300 },
      {},
      {},
      {},
      {},
    );
    assert.ok(totals);
    assert.equal(totals.totalCustoFixoManual, 300);
  });
});

describe("buildEffectiveCostMaps", () => {
  it("carries a recurring item's explicit value forward to later months and returns null before it started", () => {
    const explicit = new Map<string, number>([["2026:3:rent", 1000]]);
    const { valuesByMonth, overridesByMonth } = buildEffectiveCostMaps(
      [costItem({ id: "rent", recurring: true })],
      2026,
      explicit,
    );
    assert.equal(valuesByMonth[1].rent, null);
    assert.equal(valuesByMonth[2].rent, null);
    assert.equal(valuesByMonth[3].rent, 1000);
    assert.equal(valuesByMonth[6].rent, 1000);
    assert.equal(overridesByMonth[3].rent, 1000);
    assert.equal(overridesByMonth[6].rent, null);
  });

  it("does not carry forward a non-recurring item — only its own explicit month has a value", () => {
    const explicit = new Map<string, number>([["2026:3:bonus", 500]]);
    const { valuesByMonth } = buildEffectiveCostMaps(
      [costItem({ id: "bonus", recurring: false })],
      2026,
      explicit,
    );
    assert.equal(valuesByMonth[3].bonus, 500);
    assert.equal(valuesByMonth[4].bonus, null);
  });

  it("returns a value/override map for every month 1-12 even with no cost items", () => {
    const { valuesByMonth, overridesByMonth } = buildEffectiveCostMaps([], 2026, new Map());
    assert.equal(Object.keys(valuesByMonth).length, 12);
    assert.equal(Object.keys(overridesByMonth).length, 12);
  });
});

describe("buildYearTotals", () => {
  it("returns null when no month has synced lines and no manual cost is above zero", () => {
    const totals = buildYearTotals(
      [month({ month: 1 }), month({ month: 2 })],
      [costItem()],
      [],
      [],
      [],
      [],
    );
    assert.equal(totals, null);
  });

  it("sums lines/adsCost across months and computes year totals when at least one month synced", () => {
    const months = [
      month({ month: 1, lines: { ...BASE_LINES, revenueMl: 1000 }, adsCost: 10 }),
      month({ month: 2, lines: { ...BASE_LINES, revenueMl: 2000 }, adsCost: 20 }),
      month({ month: 3 }), // never synced — excluded from the sum, not treated as zero-revenue
    ];
    const totals = buildYearTotals(months, [], [], [], [], []);
    assert.ok(totals);
    assert.equal(totals.totalEntrada, 3000);
    assert.equal(totals.adsCost, 30);
  });

  it("sums a recurring fixed cost item across all 12 months into the year total", () => {
    const months = Array.from({ length: 12 }, (_, i) =>
      month({ month: i + 1, lines: { ...BASE_LINES, revenueMl: 100 }, fixedCostValues: { rent: 500 } }),
    );
    const totals = buildYearTotals(months, [costItem({ id: "rent" })], [], [], [], []);
    assert.ok(totals);
    assert.equal(totals.totalCustoFixoManual, 6000);
  });

  it("falls back to a manual-only year computation when no month ever synced but a cost item has values", () => {
    const months = Array.from({ length: 12 }, (_, i) =>
      month({ month: i + 1, investmentCostValues: { capex: i === 0 ? 1000 : 0 } }),
    );
    const totals = buildYearTotals(months, [], [], [costItem({ id: "capex" })], [], []);
    assert.ok(totals);
    assert.equal(totals.totalEntrada, 0);
    assert.equal(totals.totalInvestimentoManual, 1000);
  });
});
