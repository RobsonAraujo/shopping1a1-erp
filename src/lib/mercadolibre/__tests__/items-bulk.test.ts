import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { ITEMS_BULK_MAX_IDS, fetchItemsByIds } from "../api";

function mockBulk() {
  const calls: string[] = [];
  mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const ids = new URL(url).searchParams.get("ids")?.split(",") ?? [];
    // O ML não garante a ordem: devolve invertido, e o id "MLB404" como erro.
    return Response.json(
      [...ids].reverse().map((id) =>
        id === "MLB404"
          ? { id, status_code: 404, error: { error: "not_found" } }
          : { id, status_code: 200, body: { id, title: `Anúncio ${id}` } },
      ),
    );
  });
  return calls;
}

describe("fetchItemsByIds (/items/bulk)", () => {
  afterEach(() => mock.restoreAll());

  it("calls /items/bulk, keeps the requested order and drops failed ids", async () => {
    const calls = mockBulk();
    const items = await fetchItemsByIds("token", ["MLB1", "MLB404", "MLB2", "MLB3"]);

    assert.equal(calls.length, 1);
    assert.match(calls[0]!, /\/items\/bulk\?ids=/);
    assert.deepEqual(
      items.map((item) => item.id),
      ["MLB1", "MLB2", "MLB3"],
    );
  });

  it("splits more than 20 ids into chunks (the bulk endpoint refuses more)", async () => {
    const calls = mockBulk();
    const ids = Array.from({ length: 45 }, (_, i) => `MLB${i + 1}`);
    const items = await fetchItemsByIds("token", ids);

    assert.equal(calls.length, 3);
    for (const url of calls) {
      const count = new URL(url).searchParams.get("ids")?.split(",").length ?? 0;
      assert.ok(count <= ITEMS_BULK_MAX_IDS);
    }
    assert.deepEqual(
      items.map((item) => item.id),
      ids,
    );
  });
});
