import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeTacosPercent,
  getProductAdsDateRangeForMonth,
  getProductAdsDateRange,
  isProductAdsLookbackLimitError,
  isProductAdsMetricsRangeAvailable,
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

describe("isProductAdsMetricsRangeAvailable", () => {
  it("accepts ranges within the 90-day lookback", () => {
    const now = new Date(2026, 7, 11); // Aug 11, 2026
    assert.equal(
      isProductAdsMetricsRangeAvailable("2026-06-01", now),
      true,
    );
  });

  it("rejects ranges older than 90 days", () => {
    const now = new Date(2026, 7, 11);
    assert.equal(
      isProductAdsMetricsRangeAvailable("2026-01-01", now),
      false,
    );
  });
});

describe("isProductAdsLookbackLimitError", () => {
  it("detects the ML validation message", () => {
    assert.equal(
      isProductAdsLookbackLimitError(
        new Error(
          'product_ads/ads/search failed: 400 {"cause":[{"description":"You cannot request metrics with a date greater than 90 days"}]}',
        ),
      ),
      true,
    );
    assert.equal(
      isProductAdsLookbackLimitError(new Error("network down")),
      false,
    );
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
