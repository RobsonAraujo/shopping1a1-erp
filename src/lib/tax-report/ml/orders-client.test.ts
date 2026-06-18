import assert from "node:assert/strict";
import { describe, it } from "node:test";

/** Replica a lógica de paginação de fetchOrdersInDateRange para teste isolado. */
async function fetchAllOrderPages(
  fetchPage: (offset: number, limit: number) => Promise<{
    results: unknown[];
    paging: { total: number };
  }>,
): Promise<unknown[]> {
  const orders: unknown[] = [];
  let offset = 0;
  const limit = 50;
  let total = Infinity;

  while (offset < total) {
    const data = await fetchPage(offset, limit);
    const reported = data.paging?.total;
    total =
      reported != null && reported >= 0
        ? reported
        : (data.results?.length ?? 0) > 0
          ? Infinity
          : 0;

    const batch = data.results ?? [];
    orders.push(...batch);
    if (batch.length === 0) break;
    offset += limit;
    if (batch.length < limit) break;
  }

  return orders;
}

describe("orders search pagination", () => {
  it("collects all pages when paging.total exceeds limit", async () => {
    let callCount = 0;
    const orders = await fetchAllOrderPages(async (offset) => {
      callCount += 1;
      const batch =
        offset === 0
          ? Array.from({ length: 50 }, (_, i) => ({ id: i + 1 }))
          : Array.from({ length: 10 }, (_, i) => ({ id: 50 + i + 1 }));

      return {
        results: batch,
        paging: { total: 60 },
      };
    });

    assert.equal(callCount >= 2, true);
    assert.equal(orders.length, 60);
  });
});
