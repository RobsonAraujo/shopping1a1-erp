import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDreTaxBridge,
  buildDreTaxSource,
  computeDreSalesTax,
  parseDreTaxBreakdownKey,
  taxLinesFromBreakdown,
  type DreTaxLine,
  type DreTaxRates,
} from "../dre-sales-tax";

function rates(overrides: Partial<DreTaxRates> = {}): DreTaxRates {
  return {
    year: 2026,
    month: 9,
    regime: "LUCRO_REAL",
    simplesRatePercent: null,
    byMlItemId: new Map([
      ["MLB1", { ratePercent: 10, year: 2026, month: 9 }],
      ["MLB2", { ratePercent: -2, year: 2026, month: 9 }],
      ["MLB3", { ratePercent: 12.3456, year: 2026, month: 8 }],
      ["MLBKIT", { ratePercent: 7, year: 2026, month: 9 }],
    ]),
    bySku: new Map([["SKU-4", { ratePercent: 5, year: 2026, month: 9 }]]),
    report: {
      generatedAt: "2026-10-01T05:00:00.000Z",
      ordersFetchedAt: "2026-10-01T05:00:00.000Z",
      revenue: 10_000,
      tax: 900,
      orderCount: 100,
      legacy: false,
    },
    ...overrides,
  };
}

function line(overrides: Partial<DreTaxLine>): DreTaxLine {
  return {
    key: `item:${overrides.itemId ?? "MLB1"}`,
    itemId: "MLB1",
    sku: null,
    title: "Produto",
    quantity: 1,
    revenue: 100,
    kind: "active",
    ...overrides,
  };
}

describe("computeDreSalesTax", () => {
  it("applies each listing's exact rate from the tax report to its revenue", () => {
    const result = computeDreSalesTax(
      [
        line({ itemId: "MLB1", revenue: 1000 }),
        line({ itemId: "MLB3", revenue: 100 }),
      ],
      rates(),
    );
    // 100 + 12,3456 — % sem arredondar (antes o DRE usava o % já arredondado).
    assert.equal(result.computedTax, 112.35);
    assert.equal(result.taxErp, -112.35);
    assert.equal(result.baseRevenue, 1100);
  });

  it("taxes a product without registered cost (the tax exists with or without cost)", () => {
    // Antes: sem `pricing` o DRE gravava imposto 0 mesmo com % no tributário.
    const result = computeDreSalesTax([line({ itemId: "MLB1", revenue: 3251.9 })], rates());
    assert.equal(result.computedTax, 325.19);
    assert.equal(result.missingItemCount, 0);
  });

  it("keeps negative rates — a product's net credit offsets the others, like in the tax report", () => {
    const result = computeDreSalesTax(
      [line({ itemId: "MLB1", revenue: 1000 }), line({ itemId: "MLB2", revenue: 500 })],
      rates(),
    );
    assert.equal(result.computedTax, 90);
    const credit = result.taxBreakdown.find((i) => i.key === "item:MLB2");
    assert.equal(credit?.totalTax, -10);
    assert.equal(credit?.taxPercent, -2);
  });

  it("floors the month at zero when credits exceed debits", () => {
    const result = computeDreSalesTax([line({ itemId: "MLB2", revenue: 500 })], rates());
    assert.equal(result.computedTax, -10);
    assert.equal(result.taxErp, 0);
  });

  it("marks rates borrowed from another month and lines without any rate", () => {
    const result = computeDreSalesTax(
      [
        line({ itemId: "MLB3", revenue: 100 }),
        line({ itemId: "MLB9", key: "item:MLB9", revenue: 250 }),
      ],
      rates(),
    );
    assert.equal(result.fallbackItemCount, 1);
    assert.deepEqual(
      result.taxBreakdown.find((i) => i.key === "item:MLB3")?.rateSource,
      { kind: "report", year: 2026, month: 8 },
    );
    assert.equal(result.missingItemCount, 1);
    assert.equal(result.missingRevenue, 250);
    assert.equal(result.taxBreakdown.find((i) => i.key === "item:MLB9")?.missingTax, true);
  });

  it("falls back to the SKU text, then to the kit components' average", () => {
    const result = computeDreSalesTax(
      [
        line({ itemId: "MLB-NEW", key: "item:MLB-NEW", sku: "SKU-4", revenue: 200 }),
        line({
          itemId: "MLB-KIT2",
          key: "kit:MLB-KIT2",
          revenue: 100,
          kitComponentsRatePercent: 8,
        }),
        // O kit com % próprio no tributário usa o próprio, não os componentes.
        line({
          itemId: "MLBKIT",
          key: "kit:MLBKIT",
          revenue: 100,
          kitComponentsRatePercent: 50,
        }),
      ],
      rates(),
    );
    assert.equal(result.computedTax, 10 + 8 + 7);
    assert.deepEqual(
      result.taxBreakdown.find((i) => i.key === "kit:MLB-KIT2")?.rateSource,
      { kind: "kit_components" },
    );
  });

  it("keeps cancelled and returned orders out of the total, each annotated separately", () => {
    const result = computeDreSalesTax(
      [
        line({ itemId: "MLB1", revenue: 1000 }),
        line({ itemId: "MLB1", revenue: 200, quantity: 2, kind: "cancelled" }),
        line({ itemId: "MLB1", revenue: 300, quantity: 3, kind: "returned" }),
      ],
      rates(),
    );
    const item = result.taxBreakdown[0]!;
    assert.equal(item.totalTax, 100);
    assert.equal(item.cancelledQuantity, 2);
    assert.equal(item.cancelledTax, 20);
    assert.equal(item.returnedQuantity, 3);
    assert.equal(item.returnedTax, 30);
    assert.equal(result.returnedPaidTax, 30);
    assert.equal(result.computedTax, 100);
  });

  it("uses the Simples effective rate for every sale (no tax report in Simples)", () => {
    const result = computeDreSalesTax(
      [line({ itemId: "MLB1", revenue: 1000 }), line({ itemId: "MLB9", revenue: 500 })],
      rates({ regime: "SIMPLES", simplesRatePercent: 6 }),
    );
    assert.equal(result.computedTax, 90);
    assert.deepEqual(result.taxBreakdown[0]?.rateSource, { kind: "simples" });
  });

  it("leaves Simples without a configured rate at zero, flagged as missing", () => {
    const result = computeDreSalesTax(
      [line({ itemId: "MLB1", revenue: 1000 })],
      rates({ regime: "SIMPLES", simplesRatePercent: null }),
    );
    assert.equal(result.taxErp, 0);
    assert.equal(result.missingItemCount, 1);
  });
});

describe("buildDreTaxBridge", () => {
  it("closes when report tax minus returned paid orders equals the DRE tax", () => {
    const result = computeDreSalesTax(
      [
        line({ itemId: "MLB1", revenue: 8000 }),
        line({ itemId: "MLB1", revenue: 1000, kind: "returned" }),
      ],
      rates(),
    );
    const source = buildDreTaxSource({
      result,
      rates: rates(),
      paidOrderCount: 100,
      previousTaxErp: null,
      origin: "sync",
    });
    const bridge = buildDreTaxBridge(source);
    assert.deepEqual(bridge, {
      reportTax: 900,
      returnedPaidTax: 100,
      other: 0,
      dreTax: 800,
      closes: true,
    });
  });

  it("reports the unexplained difference when the DRE used an older report", () => {
    const bridge = buildDreTaxBridge({
      report: rates().report,
      returnedPaidTax: 0,
      computedTax: 700,
    });
    assert.equal(bridge?.other, -200);
    assert.equal(bridge?.closes, false);
  });

  it("has no bridge without a tax report for the month", () => {
    assert.equal(
      buildDreTaxBridge({ report: null, returnedPaidTax: 0, computedTax: 10 }),
      null,
    );
  });
});

describe("taxLinesFromBreakdown", () => {
  it("rebuilds the month from the saved audit and gives the same tax as the sync", () => {
    const syncLines: DreTaxLine[] = [
      line({ itemId: "MLB1", revenue: 1000 }),
      line({ itemId: "MLB1", revenue: 200, quantity: 2, kind: "cancelled" }),
      line({ itemId: "MLB1", revenue: 300, quantity: 3, kind: "returned" }),
      line({ itemId: "MLB2", key: "item:MLB2", revenue: 500 }),
      line({
        itemId: "MLB-KIT2",
        key: "kit:MLB-KIT2",
        revenue: 100,
        kitComponentsRatePercent: 8,
      }),
    ];
    const fromSync = computeDreSalesTax(syncLines, rates());
    const rebuilt = computeDreSalesTax(
      taxLinesFromBreakdown(fromSync.taxBreakdown, new Map([["MLB-KIT2", 8]])),
      rates(),
    );
    assert.equal(rebuilt.taxErp, fromSync.taxErp);
    assert.equal(rebuilt.returnedPaidTax, fromSync.returnedPaidTax);
    assert.deepEqual(rebuilt.taxBreakdown, fromSync.taxBreakdown);
  });

  it("applies a newer report's rates to the saved revenue", () => {
    const fromSync = computeDreSalesTax([line({ itemId: "MLB1", revenue: 1000 })], rates());
    const newer = rates({
      byMlItemId: new Map([["MLB1", { ratePercent: 7.5, year: 2026, month: 9 }]]),
    });
    const rebuilt = computeDreSalesTax(taxLinesFromBreakdown(fromSync.taxBreakdown), newer);
    assert.equal(rebuilt.taxErp, -75);
  });

  it("turns legacy `missing:` keys into listing keys and keeps SKU-only keys matching by SKU", () => {
    assert.deepEqual(parseDreTaxBreakdownKey("missing:MLB9"), {
      key: "item:MLB9",
      itemId: "MLB9",
    });
    assert.deepEqual(parseDreTaxBreakdownKey("kit:MLB7"), {
      key: "kit:MLB7",
      itemId: "MLB7",
    });
    assert.deepEqual(parseDreTaxBreakdownKey("Tecniforte - Kit 2 (Próprio)"), {
      key: "Tecniforte - Kit 2 (Próprio)",
      itemId: null,
    });
    const lines = taxLinesFromBreakdown([
      {
        key: "SKU-4",
        sku: "SKU-4",
        title: "Legado",
        quantity: 1,
        revenue: 200,
        taxPercent: 6.5,
        totalTax: 13,
        missingTax: false,
      },
    ]);
    assert.equal(computeDreSalesTax(lines, rates()).computedTax, 10);
  });
});
