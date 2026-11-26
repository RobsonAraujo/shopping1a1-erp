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

describe("aggregatePeriodSalesByItem — composição (canal × tipo do pedido)", () => {
  it("separa B2B (tag ou fluxo) do varejo e guarda o tipo de anúncio do pedido", () => {
    const agg = aggregatePeriodSalesByItem([
      {
        id: 1,
        status: "paid",
        tags: ["catalog", "paid"],
        context: { flows: ["catalog"] },
        order_items: [
          { item: { id: "MLB1" }, quantity: 1, unit_price: 29.87, sale_fee: 3.58, listing_type_id: "gold_special" },
        ],
      },
      {
        id: 2,
        status: "paid",
        tags: ["b2b", "price_per_quantity", "paid"],
        context: { flows: ["catalog", "b2b"] },
        order_items: [
          { item: { id: "MLB1" }, quantity: 3, unit_price: 27.85, sale_fee: 3.34, listing_type_id: "gold_special" },
        ],
      },
      {
        // só o fluxo diz que é B2B
        id: 3,
        status: "paid",
        tags: ["paid"],
        context: { flows: ["b2b"] },
        order_items: [
          { item: { id: "MLB1" }, quantity: 1, unit_price: 29.87, sale_fee: 3.58, listing_type_id: "gold_special" },
        ],
      },
      {
        id: 4,
        status: "paid",
        tags: ["paid"],
        order_items: [
          { item: { id: "MLB1" }, quantity: 2, unit_price: 36.54, sale_fee: 6.21, listing_type_id: "gold_pro" },
        ],
      },
    ]).get("MLB1");
    assert.ok(agg);

    const byKey = new Map(agg.mix.map((e) => [`${e.channel}|${e.listingTypeId}`, e]));
    const b2b = byKey.get("b2b|gold_special");
    assert.ok(b2b);
    assert.equal(b2b.units, 4);
    assert.equal(b2b.orders, 2);
    assert.equal(b2b.revenue, 113.42); // 3 × 27,85 + 29,87
    assert.equal(b2b.saleFeeSum, 13.6); // 3 × 3,34 + 3,58
    assert.equal(b2b.saleFeeKnownQty, 4);
    assert.equal(b2b.minUnitPrice, 27.85);
    assert.equal(b2b.maxUnitPrice, 29.87);

    assert.equal(byKey.get("retail|gold_special")?.units, 1);
    assert.equal(byKey.get("retail|gold_pro")?.units, 2);
    assert.equal(byKey.get("retail|gold_pro")?.revenue, 73.08);

    // a composição soma o mesmo que a linha, sem envio (esse só no painel)
    assert.equal(agg.mix.reduce((sum, e) => sum + e.units, 0), agg.quantity);
    assert.ok(agg.mix.every((e) => e.logistic === undefined));
    // da maior pra menor
    assert.equal(agg.mix[0]?.channel, "b2b");
  });

  it("guarda tipo nulo quando o pedido não traz listing_type_id", () => {
    const agg = aggregatePeriodSalesByItem([
      order([{ item: { id: "MLB1" }, quantity: 1, unit_price: 10 }]),
    ]).get("MLB1");
    assert.ok(agg);
    assert.equal(agg.mix.length, 1);
    assert.equal(agg.mix[0]?.listingTypeId, null);
    assert.equal(agg.mix[0]?.channel, "retail");
    assert.equal(agg.mix[0]?.saleFeeKnownQty, 0);
  });
});

describe("aggregatePeriodSalesByItem — vendas Flex", () => {
  // Pedidos reais de 19/11/2026 (MLB3811115045): um Flex e um Full.
  const flexOrder: OrderSearchOrder = {
    id: 2000019655897020,
    status: "paid",
    shipping: { id: 48573854217 },
    order_items: [
      { item: { id: "MLB3811115045" }, quantity: 1, unit_price: 64.59, sale_fee: 16.15, listing_type_id: "gold_special" },
    ],
  };
  const fullOrder: OrderSearchOrder = {
    id: 2000019660563168,
    status: "paid",
    shipping: { id: 48576504060 },
    order_items: [
      { item: { id: "MLB3811115045" }, quantity: 2, unit_price: 67.37, sale_fee: 8.76, listing_type_id: "gold_special" },
    ],
  };

  it("conta as unidades dos envios Flex na linha e na composição", () => {
    const agg = aggregatePeriodSalesByItem(
      [flexOrder, fullOrder],
      new Set(["48573854217"]),
    ).get("MLB3811115045");
    assert.ok(agg);
    assert.equal(agg.quantity, 3);
    assert.equal(agg.flexUnits, 1);
    // a tarifa continua a do pedido (no Flex, já com o custo fixo)
    assert.ok(Math.abs(agg.saleFeeSum - (16.15 + 8.76 * 2)) < 1e-9);
    assert.equal(agg.mix.length, 1);
    assert.equal(agg.mix[0]?.flexUnits, 1);
  });

  it("sem envios Flex, nenhuma unidade é Flex", () => {
    const agg = aggregatePeriodSalesByItem([flexOrder, fullOrder]).get("MLB3811115045");
    assert.ok(agg);
    assert.equal(agg.flexUnits, 0);
    assert.equal(agg.mix[0]?.flexUnits, 0);
  });
});
