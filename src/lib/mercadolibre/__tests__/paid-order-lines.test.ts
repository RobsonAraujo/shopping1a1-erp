import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  paidOrderLinesFromOrders,
  returnedPaidOrderIdsFromOrders,
  splitOrderLinesByCancelledOrderIds,
} from "../api";

describe("paidOrderLinesFromOrders", () => {
  it("attaches orderId and skips cancelled status", () => {
    const lines = paidOrderLinesFromOrders([
      {
        id: 10,
        status: "paid",
        date_closed: "2026-08-01T12:00:00.000Z",
        order_items: [
          { quantity: 2, unit_price: 50, item: { id: "MLB1" } },
        ],
      },
      {
        id: 20,
        status: "cancelled",
        order_items: [{ quantity: 1, unit_price: 99, item: { id: "MLB2" } }],
      },
    ]);
    assert.equal(lines.length, 1);
    assert.equal(lines[0]?.orderId, "10");
    assert.equal(lines[0]?.quantity, 2);
    assert.equal(lines[0]?.revenue, 100);
  });
});

describe("paidOrderLinesFromOrders — orderDateYmd", () => {
  it("uses the São Paulo calendar day, not the server's (late-evening BRT order stays on its day)", () => {
    const lines = paidOrderLinesFromOrders([
      {
        id: 30,
        status: "paid",
        // 22:30 BRT do dia 31 = 01:30 UTC do dia 1º.
        date_closed: "2026-03-31T22:30:00.000-03:00",
        order_items: [{ quantity: 1, unit_price: 10, item: { id: "MLB3" } }],
      },
    ]);
    assert.equal(lines[0]?.orderDateYmd, "2026-03-31");
  });
});

describe("splitOrderLinesByCancelledOrderIds", () => {
  it("moves paid lines whose orderId or packId is on the invoice cancelled set", () => {
    const { activeLines, returnedOnInvoiceLines } =
      splitOrderLinesByCancelledOrderIds(
        [
          { itemId: "A", quantity: 1, revenue: 10, orderId: "1" },
          { itemId: "B", quantity: 3, revenue: 30, orderId: "2" },
          { itemId: "C", quantity: 1, revenue: 5, orderId: null },
          { itemId: "D", quantity: 1, revenue: 8, orderId: "9", packId: "pack-1" },
        ],
        new Set(["2", "pack-1"]),
      );
    assert.deepEqual(
      activeLines.map((l) => l.itemId),
      ["A", "C"],
    );
    assert.deepEqual(
      returnedOnInvoiceLines.map((l) => l.itemId).sort(),
      ["B", "D"],
    );
  });
});

describe("returnedPaidOrderIdsFromOrders", () => {
  const now = new Date("2026-10-12T12:00:00.000Z");

  it("picks paid orders tagged returned, refunded, with return request, or long undelivered", () => {
    const ids = returnedPaidOrderIdsFromOrders(
      [
        { id: 1, status: "paid", tags: ["paid", "delivered"] },
        {
          id: 2,
          status: "paid",
          tags: ["paid", "not_delivered"],
          date_closed: "2026-08-20T12:00:00.000Z",
        },
        { id: 3, status: "cancelled", tags: ["not_delivered"] },
        { id: 4, status: "paid", tags: ["returned"] },
        {
          id: 5,
          pack_id: 99,
          status: "paid",
          payments: [{ status: "refunded" }],
        },
        {
          id: 6,
          status: "paid",
          order_request: { return: { id: 1 } },
        },
      ],
      now,
    );
    assert.deepEqual([...ids].sort(), ["2", "4", "5", "6", "99"]);
  });

  it("keeps a recent not_delivered order as a sale — it is just in transit", () => {
    const ids = returnedPaidOrderIdsFromOrders(
      [
        {
          id: 7,
          status: "paid",
          tags: ["paid", "not_delivered"],
          date_closed: "2026-10-05T12:00:00.000Z",
        },
        // Sem data não dá para saber a idade: não conta como devolvido.
        { id: 8, status: "paid", tags: ["paid", "not_delivered"] },
      ],
      now,
    );
    assert.deepEqual([...ids], []);
  });
});
