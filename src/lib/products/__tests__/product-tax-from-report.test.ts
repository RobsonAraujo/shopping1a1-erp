import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRollingTaxLookup,
  resolveTaxWindow,
} from "@/lib/products/product-tax-from-report";
import type {
  TaxFallbackRow,
  TaxWindowRow,
} from "@/lib/tax-report/service/tax-daily-totals-data";

/** Meio-dia em São Paulo do dia informado. */
function spNoon(ymd: string): Date {
  return new Date(`${ymd}T12:00:00.000-03:00`);
}

describe("resolveTaxWindow", () => {
  it("ends on the day the orders were fetched when the current month is stale", () => {
    const window = resolveTaxWindow(
      { year: 2026, month: 10, ordersFetchedAt: "2026-10-06T14:00:00.000Z" },
      spNoon("2026-10-27"),
    );
    assert.deepEqual(window, { from: "2026-09-07", to: "2026-10-06" });
  });

  it("is capped at the end of the snapshot month when the fetch happened after it", () => {
    const window = resolveTaxWindow(
      { year: 2026, month: 9, ordersFetchedAt: "2026-10-15T17:02:04.675Z" },
      spNoon("2026-10-27"),
    );
    assert.deepEqual(window, { from: "2026-09-01", to: "2026-09-30" });
  });

  it("never ends after today", () => {
    const window = resolveTaxWindow(
      { year: 2026, month: 10, ordersFetchedAt: "2026-11-02T10:00:00.000Z" },
      spNoon("2026-10-20"),
    );
    assert.equal(window.to, "2026-10-20");
  });

  it("uses the São Paulo day of the fetch (01:00 UTC is still the previous day)", () => {
    const window = resolveTaxWindow(
      { year: 2026, month: 10, ordersFetchedAt: "2026-10-07T01:00:00.000Z" },
      spNoon("2026-10-27"),
    );
    assert.equal(window.to, "2026-10-06");
  });

  it("crosses a year boundary", () => {
    const window = resolveTaxWindow(
      { year: 2027, month: 1, ordersFetchedAt: "2027-01-10T15:00:00.000Z" },
      spNoon("2027-01-20"),
    );
    assert.deepEqual(window, { from: "2026-12-12", to: "2027-01-10" });
  });
});

const WINDOW = { from: "2026-09-07", to: "2026-10-06" };
const WINDOW_SNAPSHOT = {
  year: 2026,
  month: 10,
  generatedAt: "2026-10-06T14:00:00.000Z",
};

function windowRow(overrides: Partial<TaxWindowRow> = {}): TaxWindowRow {
  return { mlItemId: "MLB1", skus: ["SKU-A"], receita: 1000, imposto: 89.4, ...overrides };
}

function fallbackRow(overrides: Partial<TaxFallbackRow> = {}): TaxFallbackRow {
  return {
    mlItemId: "MLB1",
    sku: "SKU-A",
    skuAliases: null,
    impostoOperacionalMedioPercentual: 12,
    impostoOperacionalTotal: 120,
    receitaTotal: 1000,
    year: 2026,
    month: 9,
    generatedAt: "2026-10-15T17:02:04.675Z",
    ...overrides,
  };
}

function lookup(windowRows: TaxWindowRow[], fallbackRows: TaxFallbackRow[]) {
  return buildRollingTaxLookup({
    window: WINDOW,
    windowSnapshot: WINDOW_SNAPSHOT,
    windowRows,
    fallbackRows,
    generatedAt: WINDOW_SNAPSHOT.generatedAt,
  });
}

describe("buildRollingTaxLookup", () => {
  it("uses imposto ÷ receita of the window when the listing sold in it", () => {
    const result = lookup([windowRow()], [fallbackRow()]);
    const entry = result.byMlItemId.get("MLB1");
    assert.equal(entry?.taxPercent, 8.94);
    assert.equal(entry?.basis, "rolling30d");
    assert.equal(entry?.periodFrom, "2026-09-07");
    assert.equal(entry?.periodTo, "2026-10-06");
    assert.equal(result.bySku.get("SKU-A"), entry);
    assert.deepEqual(result.window, WINDOW);
  });

  it("gives a rate to a listing that only sold in the current month", () => {
    const result = lookup([windowRow({ mlItemId: "MLB-NOVO", skus: ["NOVO"] })], []);
    assert.equal(result.byMlItemId.get("MLB-NOVO")?.basis, "rolling30d");
  });

  it("falls back to the most recent month for a listing without sales in the window", () => {
    const result = lookup(
      [windowRow()],
      [
        fallbackRow({ mlItemId: "MLB2", sku: "SKU-B", impostoOperacionalMedioPercentual: 7, month: 8 }),
        fallbackRow({ mlItemId: "MLB2", sku: "SKU-B", impostoOperacionalMedioPercentual: 5, month: 6 }),
      ],
    );
    const entry = result.byMlItemId.get("MLB2");
    assert.equal(entry?.taxPercent, 7);
    assert.equal(entry?.basis, "month");
    assert.equal(entry?.month, 8);
    assert.equal(entry?.periodFrom, undefined);
  });

  it("falls back when the window revenue is zero", () => {
    const result = lookup([windowRow({ receita: 0, imposto: 0 })], [fallbackRow()]);
    assert.equal(result.byMlItemId.get("MLB1")?.basis, "month");
    assert.equal(result.byMlItemId.get("MLB1")?.taxPercent, 12);
  });

  it("points old SKUs/aliases of a listing that sold in the window to the window rate", () => {
    const result = lookup(
      [windowRow()],
      [fallbackRow({ sku: "SKU-ANTIGO", skuAliases: ["OLD-SKU-A"] })],
    );
    const windowEntry = result.byMlItemId.get("MLB1");
    assert.equal(result.bySku.get("SKU-ANTIGO"), windowEntry);
    assert.equal(result.bySku.get("OLD-SKU-A"), windowEntry);
  });

  it("resolves each listing by mlItemId when two share the same display sku", () => {
    const result = lookup(
      [],
      [
        fallbackRow({ mlItemId: "MLB1", sku: "SKU-COLIDIU", impostoOperacionalMedioPercentual: 20 }),
        fallbackRow({ mlItemId: "MLB2", sku: "SKU-COLIDIU", impostoOperacionalMedioPercentual: 12 }),
      ],
    );
    assert.equal(result.byMlItemId.get("MLB1")?.taxPercent, 20);
    assert.equal(result.byMlItemId.get("MLB2")?.taxPercent, 12);
    assert.equal(result.bySku.get("SKU-COLIDIU")?.taxPercent, 20);
  });

  it("computes the percent from totals for old snapshots without the stored percent", () => {
    const result = lookup(
      [],
      [fallbackRow({ impostoOperacionalMedioPercentual: null, impostoOperacionalTotal: 50, receitaTotal: 400 })],
    );
    assert.equal(result.byMlItemId.get("MLB1")?.taxPercent, 12.5);
  });

  it("uses only the monthly fallback when no snapshot has daily totals yet", () => {
    const result = buildRollingTaxLookup({
      window: null,
      windowSnapshot: null,
      windowRows: [],
      fallbackRows: [fallbackRow()],
      generatedAt: "2026-10-15T17:02:04.675Z",
    });
    assert.equal(result.window, null);
    assert.equal(result.byMlItemId.get("MLB1")?.basis, "month");
  });
});
