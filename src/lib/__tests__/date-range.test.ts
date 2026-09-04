import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lastClosedMonth, monthsInRange } from "@/lib/date-range";

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

describe("lastClosedMonth", () => {
  it("returns the previous month within the same year", () => {
    assert.deepEqual(lastClosedMonth(new Date(2026, 8, 15)), { year: 2026, month: 8 });
  });

  it("returns the previous month right after a month boundary", () => {
    assert.deepEqual(lastClosedMonth(new Date(2026, 8, 1)), { year: 2026, month: 8 });
  });

  it("crosses a year boundary in January", () => {
    assert.deepEqual(lastClosedMonth(new Date(2026, 0, 10)), { year: 2025, month: 12 });
  });

  it("defaults to today when no reference is given", () => {
    const today = new Date();
    const expectedMonth = today.getMonth() === 0 ? 12 : today.getMonth();
    const expectedYear = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear();
    assert.deepEqual(lastClosedMonth(), { year: expectedYear, month: expectedMonth });
  });
});
