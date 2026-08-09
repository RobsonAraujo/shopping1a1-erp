import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeTacosPercent,
  getProductAdsDateRangeForMonth,
  getProductAdsDateRange,
  PRODUCT_ADS_PERIOD_DAYS,
} from "../product-ads-metrics";

describe("computeTacosPercent", () => {
  it("computes cost / (total + organic) as a percentage rounded to 2 decimals", () => {
    assert.equal(computeTacosPercent(10, 90, 10), 10);
    assert.equal(computeTacosPercent(1, 3, 0), 33.33);
  });

  it("returns null when there's cost but zero revenue", () => {
    assert.equal(computeTacosPercent(10, 0, 0), null);
  });

  it("returns 0 when there's no cost and no revenue", () => {
    assert.equal(computeTacosPercent(0, 0, 0), 0);
  });
});

describe("getProductAdsDateRangeForMonth", () => {
  it("returns the full month range for a past month", () => {
    const { dateFrom, dateTo } = getProductAdsDateRangeForMonth(2020, 2);
    assert.equal(dateFrom, "2020-02-01");
    assert.equal(dateTo, "2020-02-29"); // leap year
  });

  it("caps dateTo at today for the current month", () => {
    const now = new Date();
    const { dateFrom, dateTo } = getProductAdsDateRangeForMonth(
      now.getUTCFullYear(),
      now.getUTCMonth() + 1,
      "UTC",
    );
    assert.equal(dateFrom.slice(0, 7), dateTo.slice(0, 7));
    assert.ok(dateTo <= dateFrom.slice(0, 8) + "31");
  });
});

describe("getProductAdsDateRange", () => {
  it("defaults to a PRODUCT_ADS_PERIOD_DAYS-day trailing window ending today", () => {
    const { dateFrom, dateTo } = getProductAdsDateRange(7, "UTC");
    const from = new Date(dateFrom + "T00:00:00Z");
    const to = new Date(dateTo + "T00:00:00Z");
    const diffDays = Math.round(
      (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000),
    );
    assert.equal(diffDays, PRODUCT_ADS_PERIOD_DAYS - 1);
  });
});
