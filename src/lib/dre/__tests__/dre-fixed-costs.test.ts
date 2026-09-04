import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildExplicitFixedCostMap,
  resolveEffectiveFixedCostsForYear,
} from "../dre-fixed-costs";

describe("resolveEffectiveFixedCostsForYear", () => {
  it("carries forward within the year", () => {
    const explicit = buildExplicitFixedCostMap([
      { costItemId: "rent", year: 2026, month: 1, amount: 3000 },
      { costItemId: "rent", year: 2026, month: 4, amount: 3200 },
    ]);

    const resolved = resolveEffectiveFixedCostsForYear(["rent"], 2026, explicit);

    assert.equal(resolved[1].rent, 3000);
    assert.equal(resolved[2].rent, 3000);
    assert.equal(resolved[3].rent, 3000);
    assert.equal(resolved[4].rent, 3200);
    assert.equal(resolved[12].rent, 3200);
  });

  it("seeds january from previous year december", () => {
    const explicit = buildExplicitFixedCostMap([
      { costItemId: "rent", year: 2025, month: 12, amount: 2800 },
    ]);

    const resolved = resolveEffectiveFixedCostsForYear(["rent"], 2026, explicit);

    assert.equal(resolved[1].rent, 2800);
    assert.equal(resolved[6].rent, 2800);
  });

  it("returns null when no value was ever set", () => {
    const resolved = resolveEffectiveFixedCostsForYear(
      ["rent"],
      2026,
      new Map(),
    );
    assert.equal(resolved[1].rent, null);
  });

  it("does not carry forward when item is not recurring", () => {
    const explicit = buildExplicitFixedCostMap([
      { costItemId: "bonus", year: 2026, month: 3, amount: 500 },
      { costItemId: "bonus", year: 2025, month: 12, amount: 900 },
    ]);
    const recurringByItemId = new Map([["bonus", false]]);

    const resolved = resolveEffectiveFixedCostsForYear(
      ["bonus"],
      2026,
      explicit,
      recurringByItemId,
    );

    assert.equal(resolved[2].bonus, null);
    assert.equal(resolved[3].bonus, 500);
    assert.equal(resolved[4].bonus, null);
    assert.equal(resolved[1].bonus, null);
  });
});
