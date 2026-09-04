import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildExcludedMonthsSet,
  buildExplicitFixedCostMap,
  resolveEffectiveFixedCostForMonth,
  resolveFixedCostCreditForMonth,
} from "@/lib/tax-report/fixed-cost-credit";

describe("resolveEffectiveFixedCostForMonth", () => {
  it("returns the explicit value for the requested month", () => {
    const explicit = buildExplicitFixedCostMap([
      { costItemId: "aluguel", year: 2026, month: 3, amount: 800 },
    ]);
    assert.equal(
      resolveEffectiveFixedCostForMonth("aluguel", 2026, 3, explicit),
      800,
    );
  });

  it("carries forward the last explicit value to months without one", () => {
    const explicit = buildExplicitFixedCostMap([
      { costItemId: "aluguel", year: 2026, month: 1, amount: 800 },
    ]);
    assert.equal(
      resolveEffectiveFixedCostForMonth("aluguel", 2026, 5, explicit),
      800,
    );
  });

  it("carries forward across year boundary (december of previous year)", () => {
    const explicit = buildExplicitFixedCostMap([
      { costItemId: "aluguel", year: 2025, month: 12, amount: 750 },
    ]);
    assert.equal(
      resolveEffectiveFixedCostForMonth("aluguel", 2026, 2, explicit),
      750,
    );
  });

  it("returns null when there is no explicit value before the requested month", () => {
    const explicit = buildExplicitFixedCostMap([
      { costItemId: "aluguel", year: 2026, month: 6, amount: 800 },
    ]);
    assert.equal(
      resolveEffectiveFixedCostForMonth("aluguel", 2026, 3, explicit),
      null,
    );
  });

  it("a later explicit value overrides the carried-forward one", () => {
    const explicit = buildExplicitFixedCostMap([
      { costItemId: "aluguel", year: 2026, month: 1, amount: 800 },
      { costItemId: "aluguel", year: 2026, month: 4, amount: 900 },
    ]);
    assert.equal(
      resolveEffectiveFixedCostForMonth("aluguel", 2026, 5, explicit),
      900,
    );
  });

  it("non-recurring item does not carry forward to later months", () => {
    const explicit = buildExplicitFixedCostMap([
      { costItemId: "bonus", year: 2026, month: 3, amount: 500 },
    ]);
    assert.equal(
      resolveEffectiveFixedCostForMonth("bonus", 2026, 4, explicit, false),
      null,
    );
  });

  it("non-recurring item works for the exact month it was registered", () => {
    const explicit = buildExplicitFixedCostMap([
      { costItemId: "bonus", year: 2026, month: 3, amount: 500 },
    ]);
    assert.equal(
      resolveEffectiveFixedCostForMonth("bonus", 2026, 3, explicit, false),
      500,
    );
  });

  it("excluded month resolves to null, but does not break inheritance for later months", () => {
    const explicit = buildExplicitFixedCostMap([
      { costItemId: "aluguel", year: 2026, month: 6, amount: 800 },
    ]);
    const excluded = buildExcludedMonthsSet([
      { costItemId: "aluguel", year: 2026, month: 8 },
    ]);
    // August itself: excluded -> null.
    assert.equal(
      resolveEffectiveFixedCostForMonth(
        "aluguel", 2026, 8, explicit, true, excluded,
      ),
      null,
    );
    // September: walks back past the excluded August straight to June=800.
    assert.equal(
      resolveEffectiveFixedCostForMonth(
        "aluguel", 2026, 9, explicit, true, excluded,
      ),
      800,
    );
    // July (before the exclusion): unaffected, still inherits from June.
    assert.equal(
      resolveEffectiveFixedCostForMonth(
        "aluguel", 2026, 7, explicit, true, excluded,
      ),
      800,
    );
  });

  it("item ended at (endYear, endMonth) does not apply from that month forward, but applies before", () => {
    const explicit = buildExplicitFixedCostMap([
      { costItemId: "aluguel", year: 2026, month: 6, amount: 800 },
    ]);
    // Ended as of August 2026.
    assert.equal(
      resolveEffectiveFixedCostForMonth(
        "aluguel", 2026, 7, explicit, true, undefined, 2026, 8,
      ),
      800,
    );
    assert.equal(
      resolveEffectiveFixedCostForMonth(
        "aluguel", 2026, 8, explicit, true, undefined, 2026, 8,
      ),
      null,
    );
    assert.equal(
      resolveEffectiveFixedCostForMonth(
        "aluguel", 2026, 9, explicit, true, undefined, 2026, 8,
      ),
      null,
    );
    assert.equal(
      resolveEffectiveFixedCostForMonth(
        "aluguel", 2027, 1, explicit, true, undefined, 2026, 8,
      ),
      null,
    );
  });

  it("end cutoff takes priority over exclusion/inheritance checks", () => {
    const explicit = buildExplicitFixedCostMap([
      { costItemId: "aluguel", year: 2026, month: 6, amount: 800 },
    ]);
    const excluded = buildExcludedMonthsSet([]);
    assert.equal(
      resolveEffectiveFixedCostForMonth(
        "aluguel", 2026, 8, explicit, true, excluded, 2026, 1,
      ),
      null,
    );
  });
});

describe("resolveFixedCostCreditForMonth", () => {
  it("uses the full registered value for a closed month", () => {
    const explicit = buildExplicitFixedCostMap([
      { costItemId: "a", year: 2026, month: 1, amount: 800 },
    ]);
    const result = resolveFixedCostCreditForMonth({
      items: [{ id: "a", active: true, recurring: true }],
      explicitValues: explicit,
      year: 2026,
      month: 1,
      now: new Date("2026-03-01T12:00:00.000Z"),
    });
    assert.equal(result.mesEmAndamento, false);
    assert.equal(result.totalRegistrado, 800);
    assert.equal(result.totalCreditavel, 800);
    assert.equal(result.diasCorridos, result.diasNoMes);
  });

  it("prorates by elapsed days for the current calendar month", () => {
    const explicit = buildExplicitFixedCostMap([
      { costItemId: "a", year: 2026, month: 8, amount: 800 },
    ]);
    // 2026-08-03 in America/Sao_Paulo — day 3 of a 31-day month.
    const now = new Date("2026-08-03T15:00:00.000Z");
    const result = resolveFixedCostCreditForMonth({
      items: [{ id: "a", active: true, recurring: true }],
      explicitValues: explicit,
      year: 2026,
      month: 8,
      now,
    });
    assert.equal(result.mesEmAndamento, true);
    assert.equal(result.totalRegistrado, 800);
    assert.equal(result.diasNoMes, 31);
    assert.equal(result.diasCorridos, 3);
    assert.equal(result.totalCreditavel, Math.round((800 * 3) / 31 * 100) / 100);
  });

  it("ignores inactive items", () => {
    const explicit = buildExplicitFixedCostMap([
      { costItemId: "a", year: 2026, month: 1, amount: 800 },
    ]);
    const result = resolveFixedCostCreditForMonth({
      items: [{ id: "a", active: false, recurring: true }],
      explicitValues: explicit,
      year: 2026,
      month: 1,
      now: new Date("2026-03-01T12:00:00.000Z"),
    });
    assert.equal(result.totalRegistrado, 0);
    assert.equal(result.totalCreditavel, 0);
  });

  it("excludes an ended item from the cutoff month forward, keeps summing before it", () => {
    const explicit = buildExplicitFixedCostMap([
      { costItemId: "a", year: 2026, month: 1, amount: 800 },
    ]);
    const before = resolveFixedCostCreditForMonth({
      items: [{ id: "a", active: true, recurring: true, endYear: 2026, endMonth: 8 }],
      explicitValues: explicit,
      year: 2026,
      month: 7,
      now: new Date("2026-12-01T12:00:00.000Z"),
    });
    const atCutoff = resolveFixedCostCreditForMonth({
      items: [{ id: "a", active: true, recurring: true, endYear: 2026, endMonth: 8 }],
      explicitValues: explicit,
      year: 2026,
      month: 8,
      now: new Date("2026-12-01T12:00:00.000Z"),
    });
    assert.equal(before.totalRegistrado, 800);
    assert.equal(atCutoff.totalRegistrado, 0);
  });

  it("skips only the excluded month for an item, other months keep the inherited value", () => {
    const explicit = buildExplicitFixedCostMap([
      { costItemId: "a", year: 2026, month: 6, amount: 800 },
    ]);
    const excludedMonths = buildExcludedMonthsSet([
      { costItemId: "a", year: 2026, month: 8 },
    ]);
    const august = resolveFixedCostCreditForMonth({
      items: [{ id: "a", active: true, recurring: true }],
      explicitValues: explicit,
      excludedMonths,
      year: 2026,
      month: 8,
      now: new Date("2026-12-01T12:00:00.000Z"),
    });
    const september = resolveFixedCostCreditForMonth({
      items: [{ id: "a", active: true, recurring: true }],
      explicitValues: explicit,
      excludedMonths,
      year: 2026,
      month: 9,
      now: new Date("2026-12-01T12:00:00.000Z"),
    });
    assert.equal(august.totalRegistrado, 0);
    assert.equal(september.totalRegistrado, 800);
  });
});
