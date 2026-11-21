import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OrderSearchOrder } from "@/lib/mercadolibre/types";
import {
  orderNeedsShipment,
  planOrderStockEffects,
  resolveLineLocation,
  type ListingStockTarget,
} from "../stock-order-effects";

const ACTIVATED = new Date("2026-11-21T12:00:00Z");
const SELLER_NODE = "BRP17013423321";
const nodes = new Set([SELLER_NODE]);

function order(partial: Partial<OrderSearchOrder>): OrderSearchOrder {
  return {
    id: 2000000000001,
    status: "paid",
    date_closed: "2026-11-21T15:00:00.000-03:00",
    order_items: [
      { item: { id: "MLB1", title: "Cabo" }, quantity: 2, stock: { node_id: SELLER_NODE } },
    ],
    shipping: { id: 99 },
    ...partial,
  };
}

const targets: Record<string, ListingStockTarget> = {
  MLB1: { kind: "item", stockItemId: "item-1" },
  MLB2: { kind: "item", stockItemId: "item-1" }, // opção de venda Premium do mesmo UP
  KIT1: {
    kind: "kit",
    components: [
      { stockItemId: "item-1", quantity: 2 },
      { stockItemId: "item-2", quantity: 1 },
    ],
  },
};
const resolveListing = (id: string) => targets[id] ?? null;

describe("resolveLineLocation", () => {
  it("own when the line left a seller node, full when it left an ML node", () => {
    assert.equal(resolveLineLocation({ nodeId: SELLER_NODE, sellerNodeIds: nodes, shipment: null }), "own");
    assert.equal(resolveLineLocation({ nodeId: "BRSP19", sellerNodeIds: nodes, shipment: null }), "full");
  });

  it("falls back to the shipment when seller nodes are unknown or the node is missing", () => {
    const empty = new Set<string>();
    assert.equal(resolveLineLocation({ nodeId: "BRSP19", sellerNodeIds: empty, shipment: null }), null);
    assert.equal(
      resolveLineLocation({
        nodeId: null,
        sellerNodeIds: nodes,
        shipment: { logisticType: "fulfillment", status: "shipped", tags: [] },
      }),
      "full",
    );
    assert.equal(
      resolveLineLocation({
        nodeId: null,
        sellerNodeIds: empty,
        shipment: { logisticType: "xd_drop_off", status: "ready_to_ship", tags: [] },
      }),
      "own",
    );
  });
});

describe("planOrderStockEffects", () => {
  it("ignores orders closed before the activation (already in the opening balance)", () => {
    const plan = planOrderStockEffects({
      order: order({ date_closed: "2026-11-20T10:00:00Z" }),
      activatedAt: ACTIVATED,
      sellerNodeIds: nodes,
      shipment: null,
      resolveListing,
    });
    assert.equal(plan.phase, "before_activation");
    assert.equal(plan.sales.length, 0);
  });

  it("paid own-stock sale becomes a sale draft on the stock item", () => {
    const plan = planOrderStockEffects({
      order: order({}),
      activatedAt: ACTIVATED,
      sellerNodeIds: nodes,
      shipment: null,
      resolveListing,
    });
    assert.equal(plan.phase, "paid");
    assert.deepEqual(plan.sales, [
      {
        stockItemId: "item-1",
        location: "own",
        units: 2,
        sourceLineKey: "MLB1",
        listingMlItemId: "MLB1",
        nodeId: SELLER_NODE,
      },
    ]);
    assert.equal(plan.needsShipment, false);
    // venda de casa: lê o envio só para mostrar o canal
    assert.equal(orderNeedsShipment(plan), true);
  });

  it("sale options of the same UP land on the same stock item", () => {
    const plan = planOrderStockEffects({
      order: order({
        order_items: [{ item: { id: "MLB2" }, quantity: 1, stock: { node_id: "BRSP11" } }],
      }),
      activatedAt: ACTIVATED,
      sellerNodeIds: nodes,
      shipment: null,
      resolveListing,
    });
    assert.equal(plan.sales[0].stockItemId, "item-1");
    assert.equal(plan.sales[0].location, "full");
    assert.equal(orderNeedsShipment(plan), false);
  });

  it("kit sale expands into its components", () => {
    const plan = planOrderStockEffects({
      order: order({
        order_items: [{ item: { id: "KIT1" }, quantity: 3, stock: { node_id: SELLER_NODE } }],
      }),
      activatedAt: ACTIVATED,
      sellerNodeIds: nodes,
      shipment: null,
      resolveListing,
    });
    assert.deepEqual(
      plan.sales.map((s) => [s.stockItemId, s.units, s.sourceLineKey]),
      [
        ["item-1", 6, "KIT1#item-1"],
        ["item-2", 3, "KIT1#item-2"],
      ],
    );
  });

  it("unknown listing becomes an unmapped line, never silently dropped", () => {
    const plan = planOrderStockEffects({
      order: order({
        order_items: [{ item: { id: "MLB404", title: "Novo" }, quantity: 1, stock: { node_id: SELLER_NODE } }],
      }),
      activatedAt: ACTIVATED,
      sellerNodeIds: nodes,
      shipment: null,
      resolveListing,
    });
    assert.equal(plan.sales.length, 0);
    assert.deepEqual(plan.unmapped, [
      { listingMlItemId: "MLB404", units: 1, location: "own", title: "Novo" },
    ]);
  });

  it("line without node waits for the shipment, then assumes own when nothing is known", () => {
    const withoutNode = order({ order_items: [{ item: { id: "MLB1" }, quantity: 1 }] });
    const first = planOrderStockEffects({
      order: withoutNode,
      activatedAt: ACTIVATED,
      sellerNodeIds: nodes,
      shipment: null,
      resolveListing,
    });
    assert.equal(first.needsShipment, true);
    assert.equal(first.sales.length, 0);

    const second = planOrderStockEffects({
      order: withoutNode,
      activatedAt: ACTIVATED,
      sellerNodeIds: nodes,
      shipment: null,
      resolveListing,
      assumeOwnWhenUnknown: true,
    });
    assert.equal(second.sales[0].location, "own");
  });

  it("cancelled order is planned as cancelled; dispatch comes from the shipment status", () => {
    const plan = planOrderStockEffects({
      order: order({ status: "cancelled" }),
      activatedAt: ACTIVATED,
      sellerNodeIds: nodes,
      shipment: { logisticType: "self_service", status: "shipped", tags: [] },
      resolveListing,
    });
    assert.equal(plan.phase, "cancelled");
    assert.equal(plan.dispatched, true);
    assert.equal(orderNeedsShipment(plan), true);
  });

  it("strong return signals only (no age heuristic)", () => {
    const returned = planOrderStockEffects({
      order: order({ payments: [{ status: "refunded" }] }),
      activatedAt: ACTIVATED,
      sellerNodeIds: nodes,
      shipment: null,
      resolveListing,
    });
    assert.equal(returned.returnSignaled, true);

    const inTransit = planOrderStockEffects({
      order: order({ tags: ["not_delivered", "paid"] }),
      activatedAt: ACTIVATED,
      sellerNodeIds: nodes,
      shipment: null,
      resolveListing,
    });
    assert.equal(inTransit.returnSignaled, false);
  });

  it("unpaid statuses do nothing", () => {
    const plan = planOrderStockEffects({
      order: order({ status: "payment_required" }),
      activatedAt: ACTIVATED,
      sellerNodeIds: nodes,
      shipment: null,
      resolveListing,
    });
    assert.equal(plan.phase, "ignored");
    assert.equal(orderNeedsShipment(plan), false);
  });
});
