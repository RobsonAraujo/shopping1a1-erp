import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDashboardSalesSnapshot } from "@/lib/home/sales-card-data";
import type { UserMe } from "@/lib/mercadolibre/types";

function me(
  transactions: NonNullable<UserMe["seller_reputation"]>["transactions"],
): UserMe {
  return {
    id: 1,
    nickname: "loja",
    permalink: "https://example.com",
    seller_reputation: { level_id: "5_green", power_seller_status: null, transactions },
  };
}

describe("buildDashboardSalesSnapshot", () => {
  it("returns null when completed sales are missing", () => {
    assert.equal(buildDashboardSalesSnapshot(null), null);
    assert.equal(buildDashboardSalesSnapshot(me(undefined)), null);
    assert.equal(buildDashboardSalesSnapshot(me({ canceled: 2 })), null);
  });

  it("maps completed sales and rounds satisfaction", () => {
    const snapshot = buildDashboardSalesSnapshot(
      me({
        completed: 1234,
        canceled: 10,
        ratings: { positive: 0.987 },
      }),
    );
    assert.deepEqual(snapshot, {
      completed: 1234,
      satisfactionPercent: 99,
    });
  });

  it("keeps satisfaction null when ratings are missing", () => {
    const snapshot = buildDashboardSalesSnapshot(me({ completed: 10 }));
    assert.deepEqual(snapshot, {
      completed: 10,
      satisfactionPercent: null,
    });
  });
});
