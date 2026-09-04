import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lastDaysMonthWeights, lastDaysYmdRange, monthsInRange } from "@/lib/date-range";

describe("monthsInRange", () => {
  it("returns a single month when the range stays within it", () => {
    assert.deepEqual(monthsInRange("2026-08-01", "2026-08-15"), [
      { year: 2026, month: 8 },
    ]);
  });

  it("returns two months when the range crosses a month boundary", () => {
    assert.deepEqual(monthsInRange("2026-07-25", "2026-08-05"), [
      { year: 2026, month: 7 },
      { year: 2026, month: 8 },
    ]);
  });

  it("returns a single month for a one-day range", () => {
    assert.deepEqual(monthsInRange("2026-08-10", "2026-08-10"), [
      { year: 2026, month: 8 },
    ]);
  });

  it("crosses a year boundary correctly", () => {
    assert.deepEqual(monthsInRange("2025-12-20", "2026-01-10"), [
      { year: 2025, month: 12 },
      { year: 2026, month: 1 },
    ]);
  });
});

describe("lastDaysMonthWeights", () => {
  it("returns months most-recent-first with weights summing to the window size", () => {
    const result = lastDaysMonthWeights(30);
    const totalWeight = result.reduce((sum, m) => sum + m.weightDays, 0);
    assert.equal(totalWeight, 30);
    for (const { weightDays } of result) {
      assert.ok(weightDays > 0 && weightDays <= 30);
    }
    for (let i = 1; i < result.length; i++) {
      const prev = result[i - 1];
      const curr = result[i];
      assert.ok(
        prev.year > curr.year || (prev.year === curr.year && prev.month > curr.month),
        "months must be strictly descending",
      );
    }
  });

  it("covers exactly the months (and only those) returned by monthsInRange for the same window", () => {
    const { from, to } = lastDaysYmdRange(30);
    const expectedMonths = monthsInRange(from, to);
    const result = lastDaysMonthWeights(30);
    const resultAscending = [...result].reverse().map((m) => ({
      year: m.year,
      month: m.month,
    }));
    assert.deepEqual(resultAscending, expectedMonths);
  });

  it("weights the most recent month by today's day-of-month when the window spans two months", () => {
    const result = lastDaysMonthWeights(30);
    const today = new Date();
    if (result.length === 2) {
      assert.equal(result[0].weightDays, today.getDate());
    } else {
      assert.equal(result.length, 1);
      assert.equal(result[0].weightDays, 30);
    }
  });
});
