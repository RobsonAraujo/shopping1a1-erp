import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  taxReportNeedsFullRecalc,
  taxReportStaleness,
} from "../tax-report-staleness";

// Setembro/2026 fecha em 01/10 00:00 de São Paulo = 03:00 UTC.
const OCTOBER = new Date("2026-10-12T12:00:00.000Z");

describe("taxReportStaleness", () => {
  it("treats the month still in progress as partial — information only, no alert", () => {
    const result = taxReportStaleness({
      year: 2026,
      month: 10,
      ordersFetchedAt: "2026-10-06T12:00:00.000Z",
      generatedAt: "2026-10-06T12:00:00.000Z",
      now: OCTOBER,
    });
    assert.equal(result.completeness, "partial");
    assert.deepEqual(result.reasons, []);
  });

  it("flags a closed month whose orders were fetched before it closed", () => {
    const result = taxReportStaleness({
      year: 2026,
      month: 9,
      ordersFetchedAt: "2026-09-10T03:56:00.000Z",
      generatedAt: "2026-09-10T03:56:00.000Z",
      now: OCTOBER,
    });
    assert.equal(result.completeness, "incomplete");
    assert.deepEqual(result.reasons, ["incomplete"]);
    assert.equal(taxReportNeedsFullRecalc(result.reasons), true);
  });

  it("considers the report up to date when orders were fetched after the month closed", () => {
    const result = taxReportStaleness({
      year: 2026,
      month: 9,
      ordersFetchedAt: "2026-10-01T03:00:00.000Z",
      generatedAt: "2026-10-01T03:00:00.000Z",
      now: OCTOBER,
    });
    assert.equal(result.completeness, "closed");
    assert.deepEqual(result.reasons, []);
  });

  it("uses the São Paulo month close: 30/09 23:30 BRT is still September", () => {
    const result = taxReportStaleness({
      year: 2026,
      month: 9,
      // 23:30 BRT de 30/09 = 02:30 UTC de 01/10.
      ordersFetchedAt: "2026-10-01T02:30:00.000Z",
      generatedAt: "2026-10-01T02:30:00.000Z",
      now: OCTOBER,
    });
    assert.equal(result.completeness, "incomplete");
  });

  it("keeps a quick recompute of mid-month orders incomplete — only fetching orders closes the month", () => {
    const result = taxReportStaleness({
      year: 2026,
      month: 9,
      ordersFetchedAt: "2026-09-10T03:56:00.000Z",
      generatedAt: "2026-10-15T12:00:00.000Z",
      now: new Date("2026-10-16T12:00:00.000Z"),
    });
    assert.equal(result.completeness, "incomplete");
  });

  it("flags a leveling changed after the report version and a legacy report", () => {
    const result = taxReportStaleness({
      year: 2026,
      month: 8,
      ordersFetchedAt: "2026-09-02T21:21:00.000Z",
      generatedAt: "2026-09-02T21:21:00.000Z",
      levelingUpdatedAt: "2026-09-05T10:00:00.000Z",
      legacy: true,
      now: OCTOBER,
    });
    assert.equal(result.completeness, "closed");
    assert.deepEqual(result.reasons, ["leveling", "legacy"]);
    assert.equal(taxReportNeedsFullRecalc(result.reasons), false);
  });

  it("ignores a leveling edited before the report was computed", () => {
    const result = taxReportStaleness({
      year: 2026,
      month: 8,
      ordersFetchedAt: "2026-09-02T21:21:00.000Z",
      generatedAt: "2026-09-02T21:21:00.000Z",
      levelingUpdatedAt: "2026-08-20T10:00:00.000Z",
      now: OCTOBER,
    });
    assert.deepEqual(result.reasons, []);
  });

  it("treats a closed month without a known fetch date as incomplete", () => {
    const result = taxReportStaleness({
      year: 2026,
      month: 8,
      ordersFetchedAt: null,
      generatedAt: null,
      now: OCTOBER,
    });
    assert.equal(result.completeness, "incomplete");
  });
});
