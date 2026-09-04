import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildWorkingCapitalRows, type WorkingCapitalInputRow } from "../working-capital";

function inputRow(overrides: Partial<WorkingCapitalInputRow>): WorkingCapitalInputRow {
  return {
    mlItemId: "MLB1",
    sku: "MXT 1",
    title: "Item",
    effectiveDailyAvg: 1,
    unitCost: 10,
    hasIcmsSt: false,
    isExcluded: false,
    ...overrides,
  };
}

describe("buildWorkingCapitalRows", () => {
  it("computes unitsNeeded as ceil(dailyAvg * periodDays) and grossCapital = units * unitCost", () => {
    const { rows } = buildWorkingCapitalRows(
      [inputRow({ effectiveDailyAvg: 1.5, unitCost: 10 })],
      10,
      {},
    );
    assert.equal(rows[0].unitsNeeded, 15);
    assert.equal(rows[0].grossCapital, 150);
  });

  it("divides grossCapital by supplier installments to get effectiveCapital", () => {
    const { rows } = buildWorkingCapitalRows(
      [inputRow({ sku: "MXT 1", effectiveDailyAvg: 1, unitCost: 100 })],
      10,
      { MXT: 4 },
    );
    assert.equal(rows[0].installments, 4);
    assert.equal(rows[0].grossCapital, 1000);
    assert.equal(rows[0].effectiveCapital, 250);
  });

  it("defaults to 1 installment when the supplier has no configured value", () => {
    const { rows } = buildWorkingCapitalRows(
      [inputRow({ sku: "ZZZ-1", effectiveDailyAvg: 1, unitCost: 100 })],
      10,
      {},
    );
    assert.equal(rows[0].installments, 1);
    assert.equal(rows[0].effectiveCapital, 1000);
  });

  it("clamps a configured installments value below 1 up to 1", () => {
    const { rows } = buildWorkingCapitalRows(
      [inputRow({ sku: "MXT 1", effectiveDailyAvg: 1, unitCost: 100 })],
      10,
      { MXT: 0 },
    );
    assert.equal(rows[0].installments, 1);
  });

  it("excludes rows marked isExcluded from both rows and totalCapital", () => {
    const { rows, totalCapital } = buildWorkingCapitalRows(
      [inputRow({ isExcluded: true, unitCost: 999 })],
      10,
      {},
    );
    assert.deepEqual(rows, []);
    assert.equal(totalCapital, 0);
  });

  it("reports skus with missing unit cost and excludes them from rows/total", () => {
    const { rows, totalCapital, missingCostSkus } = buildWorkingCapitalRows(
      [inputRow({ sku: "NO-COST", unitCost: null }), inputRow({ sku: "OK", unitCost: 10 })],
      10,
      {},
    );
    assert.deepEqual(missingCostSkus, ["NO-COST"]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].sku, "OK");
    assert.ok(totalCapital > 0);
  });

  it("falls back to mlItemId in missingCostSkus when sku is null", () => {
    const { missingCostSkus } = buildWorkingCapitalRows(
      [inputRow({ sku: null, mlItemId: "MLB999", unitCost: null })],
      10,
      {},
    );
    assert.deepEqual(missingCostSkus, ["MLB999"]);
  });

  it("sorts rows by effectiveCapital descending", () => {
    const { rows } = buildWorkingCapitalRows(
      [
        inputRow({ mlItemId: "SMALL", effectiveDailyAvg: 1, unitCost: 10 }),
        inputRow({ mlItemId: "BIG", effectiveDailyAvg: 10, unitCost: 100 }),
      ],
      10,
      {},
    );
    assert.equal(rows[0].mlItemId, "BIG");
  });

  it("sums totalCapital across all included rows", () => {
    const { totalCapital } = buildWorkingCapitalRows(
      [
        inputRow({ effectiveDailyAvg: 1, unitCost: 10 }),
        inputRow({ effectiveDailyAvg: 1, unitCost: 20 }),
      ],
      10,
      {},
    );
    assert.equal(totalCapital, 100 + 200);
  });
});
