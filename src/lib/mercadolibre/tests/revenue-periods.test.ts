import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getZonedYearMonth,
  isCurrentCalendarMonth,
  isFutureCalendarMonth,
  isDreMonthSyncable,
  getCalendarMonthRange,
  formatCalendarRangeYmd,
  isMlBillingPeriodCivilMonth,
  formatDreMonthLabel,
  sumRevenueForItems,
  sumUnitsForItems,
  formatUnitsSold,
  formatRevenueBRL,
} from "../revenue-periods";

const TZ = "America/Sao_Paulo";

describe("getZonedYearMonth", () => {
  it("extracts year/month for a known UTC instant in the São Paulo timezone", () => {
    // 2026-01-01T02:00:00Z is still 2025-12-31 23:00 in America/Sao_Paulo (UTC-3)
    const result = getZonedYearMonth(new Date("2026-01-01T02:00:00Z"), TZ);
    assert.deepEqual(result, { year: 2025, month: 12 });
  });
});

describe("isCurrentCalendarMonth / isFutureCalendarMonth / isDreMonthSyncable", () => {
  it("detects the current month as not future and syncable", () => {
    const { year, month } = getZonedYearMonth(new Date(), TZ);
    assert.equal(isCurrentCalendarMonth(year, month, TZ), true);
    assert.equal(isFutureCalendarMonth(year, month, TZ), false);
    assert.equal(isDreMonthSyncable(year, month, TZ), true);
  });

  it("detects a future month as not syncable", () => {
    const { year, month } = getZonedYearMonth(new Date(), TZ);
    const futureYear = month === 12 ? year + 1 : year;
    const futureMonth = month === 12 ? 1 : month + 1;
    assert.equal(isFutureCalendarMonth(futureYear, futureMonth, TZ), true);
    assert.equal(isDreMonthSyncable(futureYear, futureMonth, TZ), false);
  });

  it("detects a far-future year as future", () => {
    assert.equal(isFutureCalendarMonth(2999, 1, TZ), true);
  });

  it("detects a past year as not future", () => {
    assert.equal(isFutureCalendarMonth(2000, 1, TZ), false);
  });
});

describe("getCalendarMonthRange / formatCalendarRangeYmd", () => {
  it("returns the full first-to-last-day range for a past month", () => {
    const range = getCalendarMonthRange(2024, 2, TZ); // leap year
    const ymd = formatCalendarRangeYmd(range, TZ);
    assert.equal(ymd.from, "2024-02-01");
    assert.equal(ymd.to, "2024-02-29");
  });

  it("caps the range's end at 'now' for the current month", () => {
    const { year, month } = getZonedYearMonth(new Date(), TZ);
    const range = getCalendarMonthRange(year, month, TZ);
    assert.ok(range.to.getTime() <= Date.now());
    assert.ok(range.to.getTime() > Date.now() - 5000);
  });
});

describe("isMlBillingPeriodCivilMonth", () => {
  it("is true when the billing period matches the civil month exactly", () => {
    const civil = getCalendarMonthRange(2024, 2, TZ);
    assert.equal(isMlBillingPeriodCivilMonth(civil, 2024, 2, TZ), true);
  });

  it("is false when the billing period is shifted (e.g. ML's offset cycle)", () => {
    const shifted = {
      from: new Date("2023-12-05T03:00:00Z"),
      to: new Date("2024-01-05T02:59:59Z"),
    };
    assert.equal(isMlBillingPeriodCivilMonth(shifted, 2024, 1, TZ), false);
  });
});

describe("formatDreMonthLabel", () => {
  it("returns the pt-BR short month label", () => {
    assert.equal(formatDreMonthLabel(1), "jan.");
    assert.equal(formatDreMonthLabel(12), "dez.");
  });

  it("falls back to the raw number for out-of-range months", () => {
    assert.equal(formatDreMonthLabel(13), "13");
    assert.equal(formatDreMonthLabel(0), "0");
  });
});

describe("sumRevenueForItems / sumUnitsForItems", () => {
  it("sums only the requested item ids, defaulting missing ones to 0", () => {
    const revenueByItem = { MLB1: 100, MLB2: 50 };
    assert.equal(sumRevenueForItems(revenueByItem, ["MLB1", "MLB2", "MLB3"]), 150);
  });

  it("returns 0 for an empty id list", () => {
    assert.equal(sumRevenueForItems({ MLB1: 100 }, []), 0);
  });

  it("sums units the same way", () => {
    const unitsByItem = { MLB1: 3, MLB2: 2 };
    assert.equal(sumUnitsForItems(unitsByItem, ["MLB1", "MLB2"]), 5);
  });
});

describe("formatUnitsSold / formatRevenueBRL", () => {
  it("rounds and appends 'un.'", () => {
    assert.equal(formatUnitsSold(3.4), "3 un.");
    assert.equal(formatUnitsSold(3.6), "4 un.");
  });

  it("formats currency as BRL", () => {
    const formatted = formatRevenueBRL(1234.5);
    assert.match(formatted, /R\$/);
    assert.match(formatted, /1\.234,50/);
  });
});
