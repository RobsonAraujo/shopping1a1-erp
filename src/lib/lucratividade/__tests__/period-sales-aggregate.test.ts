import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OrderSearchOrder } from "@/lib/mercadolibre/types";
import { aggregatePeriodSalesByItem } from "../period-sales-aggregate";

function order(
  lines: OrderSearchOrder["order_items"],
  status = "paid",
): OrderSearchOrder {
  return { id: Math.random(), status, order_items: lines };
}

describe("aggregatePeriodSalesByItem", () => {
  it("treats sale_fee as per-unit (multi-unit line)", () => {
    const agg = aggregatePeriodSalesByItem([
      order([
        { item: { id: "MLB1" }, quantity: 3, unit_price: 29.85, sale_fee: 3.58 },
      ]),
      order([
        { item: { id: "MLB1" }, quantity: 1, unit_price: 29.85, sale_fee: 3.58 },
      ]),
    ]).get("MLB1");
    assert.ok(agg);
    assert.equal(agg.quantity, 4);
    assert.equal(agg.saleFeeKnownQty, 4);
    // média por unidade continua 3,58 — antes dava (3,58+3,58)/4 = 1,79
    assert.ok(Math.abs(agg.saleFeeSum / agg.saleFeeKnownQty - 3.58) < 1e-9);
    assert.ok(Math.abs(agg.revenue - 29.85 * 4) < 1e-9);
  });

  it("ignores lines without sale_fee in the fee average but keeps revenue", () => {
    const agg = aggregatePeriodSalesByItem([
      order([{ item: { id: "MLB1" }, quantity: 2, unit_price: 10, sale_fee: 1 }]),
      order([{ item: { id: "MLB1" }, quantity: 5, unit_price: 10 }]),
    ]).get("MLB1");
    assert.ok(agg);
    assert.equal(agg.quantity, 7);
    assert.equal(agg.revenue, 70);
    assert.equal(agg.saleFeeSum, 2);
    assert.equal(agg.saleFeeKnownQty, 2);
  });

  it("skips cancelled orders", () => {
    const map = aggregatePeriodSalesByItem([
      order([{ item: { id: "MLB1" }, quantity: 1, unit_price: 10 }], "cancelled"),
    ]);
    assert.equal(map.size, 0);
  });

  it("falls back to item_id and parses string quantities", () => {
    const agg = aggregatePeriodSalesByItem([
      order([
        {
          item_id: "MLB9",
          quantity: "2" as unknown as number,
          unit_price: 5,
        },
      ]),
    ]).get("MLB9");
    assert.ok(agg);
    assert.equal(agg.quantity, 2);
    assert.equal(agg.revenue, 10);
  });

  it("drops empty lines", () => {
    const map = aggregatePeriodSalesByItem([
      order([{ item: { id: "MLB1" }, quantity: 0, unit_price: 0 }]),
    ]);
    assert.equal(map.size, 0);
  });
});
