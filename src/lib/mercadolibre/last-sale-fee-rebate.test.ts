import assert from "node:assert/strict";
import { describe, it, mock, afterEach } from "node:test";
import { fetchLastSaleFeeRebate } from "./last-sale-fee-rebate";

describe("fetchLastSaleFeeRebate", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("returns rebate from billing when last paid order has rebate", async () => {
    mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/orders/search")) {
        return new Response(
          JSON.stringify({
            results: [{ id: 2000016932890044 }],
          }),
          { status: 200 },
        );
      }
      if (url.includes("/billing/integration/group/ML/order/details")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                order_id: 2000016932890044,
                sale_fee: { gross: 4.48, net: 2.92, rebate: 1.56 },
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    });

    const result = await fetchLastSaleFeeRebate("token", 1701342332, "MLB5236253058");
    assert.ok(result);
    assert.equal(result.rebate, 1.56);
    assert.equal(result.orderId, "2000016932890044");
    assert.equal(result.gross, 4.48);
    assert.equal(result.net, 2.92);
  });

  it("returns null when rebate is zero", async () => {
    mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/orders/search")) {
        return new Response(
          JSON.stringify({ results: [{ id: 123 }] }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          results: [{ sale_fee: { gross: 4.48, net: 4.48, rebate: 0 } }],
        }),
        { status: 200 },
      );
    });

    const result = await fetchLastSaleFeeRebate("token", 1, "MLB123");
    assert.equal(result, null);
  });

  it("falls back to order sale_fee when billing is not ready yet", async () => {
    mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/orders/search")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: 2000016936178136,
                order_items: [
                  {
                    item: { id: "MLB5236253058" },
                    unit_price: 26,
                    sale_fee: 1.82,
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes("/billing/integration/group/ML/order/details")) {
        return new Response(
          JSON.stringify({ results: [], total: 0 }),
          { status: 200 },
        );
      }
      if (url.includes("/sites/MLB/listing_prices")) {
        return new Response(
          JSON.stringify([
            {
              listing_type_id: "gold_special",
              sale_fee_amount: 3.38,
            },
          ]),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    });

    const result = await fetchLastSaleFeeRebate("token", 1701342332, "MLB5236253058", {
      categoryId: "MLB72745",
      listingTypeId: "gold_special",
    });
    assert.ok(result);
    assert.equal(result.rebate, 1.56);
    assert.equal(result.orderId, "2000016936178136");
    assert.equal(result.gross, 3.38);
    assert.equal(result.net, 1.82);
  });

  it("returns null for non-MLB items", async () => {
    const fetchMock = mock.method(globalThis, "fetch", async () => {
      return new Response("{}", { status: 200 });
    });

    const result = await fetchLastSaleFeeRebate("token", 1, "MLA123456");
    assert.equal(result, null);
    assert.equal(fetchMock.mock.callCount(), 0);
  });
});
