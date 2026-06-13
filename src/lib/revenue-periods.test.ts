import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatCalendarRangeYmd,
  getCalendarMonthRange,
  isMlBillingPeriodCivilMonth,
} from "./mercadolibre/revenue-periods";

describe("isMlBillingPeriodCivilMonth", () => {
  const timeZone = "America/Sao_Paulo";

  it("returns true when ML billing matches civil January", () => {
    const civil = getCalendarMonthRange(2026, 1, timeZone);
    assert.equal(
      isMlBillingPeriodCivilMonth(civil, 2026, 1, timeZone),
      true,
    );
  });

  it("returns false for ML billing cycle shifted (Dec 5 – Jan 5)", () => {
    const mlPeriod = {
      from: new Date("2025-12-05T03:00:00.000Z"),
      to: new Date("2026-01-05T02:59:59.999Z"),
    };
    assert.equal(
      isMlBillingPeriodCivilMonth(mlPeriod, 2026, 1, timeZone),
      false,
    );
    const civil = formatCalendarRangeYmd(
      getCalendarMonthRange(2026, 1, timeZone),
      timeZone,
    );
    assert.deepEqual(civil, { from: "2026-01-01", to: "2026-01-31" });
  });
});
