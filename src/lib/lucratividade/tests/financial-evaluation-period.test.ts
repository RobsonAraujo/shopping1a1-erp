import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calendarYmdRangeToUtc,
  parseFinancialEvaluationYmd,
} from "../financial-evaluation-period";

describe("financial-evaluation period dates", () => {
  it("parses valid YYYY-MM-DD", () => {
    assert.deepEqual(parseFinancialEvaluationYmd("2026-06-02"), {
      year: 2026,
      month: 6,
      day: 2,
    });
  });

  it("rejects invalid calendar dates", () => {
    assert.equal(parseFinancialEvaluationYmd("2026-02-31"), null);
    assert.equal(parseFinancialEvaluationYmd("06-02-2026"), null);
  });

  it("builds inclusive single-day range", () => {
    const range = calendarYmdRangeToUtc("2026-06-02", "2026-06-02");
    assert.ok(range);
    assert.equal(range?.periodDays, 1);
    assert.equal(range?.dateFrom, "2026-06-02");
    assert.equal(range?.dateTo, "2026-06-02");
    assert.ok(range && range.from.getTime() <= range.to.getTime());
  });

  it("counts inclusive multi-day range", () => {
    const range = calendarYmdRangeToUtc("2026-06-01", "2026-06-07");
    assert.ok(range);
    assert.equal(range?.periodDays, 7);
  });

  it("rejects inverted ranges", () => {
    assert.equal(calendarYmdRangeToUtc("2026-06-10", "2026-06-01"), null);
  });
});
