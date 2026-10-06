import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isProductAdsMetricsRangeAvailable } from "@/lib/mercadolibre/product-ads-metrics";
import {
  formatYmdRangeShort,
  resolvePeriodPreset,
} from "../period-presets";

// 6 de outubro de 2026, meio do dia (horário local)
const NOW = new Date(2026, 9, 6, 15, 30);

describe("resolvePeriodPreset", () => {
  it("today and yesterday are single days", () => {
    assert.deepEqual(resolvePeriodPreset("today", NOW), {
      from: "2026-10-06",
      to: "2026-10-06",
    });
    assert.deepEqual(resolvePeriodPreset("yesterday", NOW), {
      from: "2026-10-05",
      to: "2026-10-05",
    });
  });

  it("last N days include today", () => {
    assert.deepEqual(resolvePeriodPreset("last7", NOW), {
      from: "2026-09-30",
      to: "2026-10-06",
    });
    assert.equal(resolvePeriodPreset("last60", NOW).from, "2026-08-08");
    assert.equal(resolvePeriodPreset("last90", NOW).from, "2026-07-09");
  });

  it("current month starts on day 1", () => {
    assert.deepEqual(resolvePeriodPreset("currentMonth", NOW), {
      from: "2026-10-01",
      to: "2026-10-06",
    });
  });

  it("handles day 1 and new year boundaries", () => {
    const jan1 = new Date(2027, 0, 1, 9);
    assert.deepEqual(resolvePeriodPreset("yesterday", jan1), {
      from: "2026-12-31",
      to: "2026-12-31",
    });
    assert.deepEqual(resolvePeriodPreset("currentMonth", jan1), {
      from: "2027-01-01",
      to: "2027-01-01",
    });
  });

  it("90 days stays inside the Product Ads lookback window", () => {
    const { from } = resolvePeriodPreset("last90", NOW);
    assert.equal(isProductAdsMetricsRangeAvailable(from, NOW), true);
  });
});

describe("formatYmdRangeShort", () => {
  it("formats single day, range and cross-year", () => {
    assert.equal(formatYmdRangeShort("2026-10-06", "2026-10-06"), "06/10");
    assert.equal(
      formatYmdRangeShort("2026-10-01", "2026-10-06"),
      "01/10 – 06/10",
    );
    assert.equal(
      formatYmdRangeShort("2026-12-20", "2027-01-05"),
      "20/12/2026 – 05/01/2027",
    );
  });
});
