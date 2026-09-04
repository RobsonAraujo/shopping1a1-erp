import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calendarDayDiff,
  daysUntilPromotionEnd,
  getCalendarDateParts,
  isActivePromotionStatus,
  isPromotionExpiringWithinDays,
  parsePromotionFinishDate,
  pickEarliestActivePromotion,
} from "../item-promotions";

describe("item-promotions", () => {
  it("treats started and active as active promotion statuses", () => {
    assert.equal(isActivePromotionStatus("started"), true);
    assert.equal(isActivePromotionStatus("active"), true);
    assert.equal(isActivePromotionStatus("candidate"), false);
    assert.equal(isActivePromotionStatus(undefined), false);
  });

  it("parses finish_date from ML payload", () => {
    const parsed = parsePromotionFinishDate("2025-09-15T23:59:59");
    assert.ok(parsed);
    assert.equal(parsed?.getFullYear(), 2025);
    assert.equal(parsed?.getMonth(), 8);
  });

  it("picks earliest active promotion by finish_date", () => {
    const picked = pickEarliestActivePromotion([
      {
        type: "PRICE_DISCOUNT",
        status: "started",
        finish_date: "2025-09-20T23:59:59",
        price: 14,
        original_price: 20,
      },
      {
        type: "SELLER_CAMPAIGN",
        status: "started",
        finish_date: "2025-09-10T23:59:59",
        name: "Campanha",
        price: 12,
        original_price: 20,
      },
      {
        type: "PRICE_DISCOUNT",
        status: "candidate",
        finish_date: "2025-09-05T23:59:59",
      },
    ]);

    assert.ok(picked);
    assert.equal(picked?.type, "SELLER_CAMPAIGN");
    assert.equal(picked?.name, "Campanha");
  });

  it("computes calendar day diff in Sao Paulo timezone", () => {
    const timeZone = "America/Sao_Paulo";
    const now = new Date("2025-09-10T12:00:00-03:00");
    const finishDate = new Date("2025-09-13T23:59:59-03:00");

    assert.deepEqual(getCalendarDateParts(now, timeZone), {
      year: 2025,
      month: 9,
      day: 10,
    });
    assert.equal(calendarDayDiff(now, finishDate, timeZone), 3);
    assert.equal(daysUntilPromotionEnd(finishDate, now, timeZone), 3);
    assert.equal(
      isPromotionExpiringWithinDays(finishDate, now, 3, timeZone),
      true,
    );
    assert.equal(
      isPromotionExpiringWithinDays(finishDate, now, 2, timeZone),
      false,
    );
  });

  it("flags promotion ending today as expiring within 3 days", () => {
    const timeZone = "America/Sao_Paulo";
    const now = new Date("2025-09-10T12:00:00-03:00");
    const finishDate = new Date("2025-09-10T23:59:59-03:00");

    assert.equal(daysUntilPromotionEnd(finishDate, now, timeZone), 0);
    assert.equal(
      isPromotionExpiringWithinDays(finishDate, now, 3, timeZone),
      true,
    );
  });
});
