import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { loadCatalogEligibleListings } from "@/lib/home/catalog-eligible-data";

const USER_ID = 1;
const TAG = "catalog_listing_eligible";

function itemBody(overrides: Record<string, unknown> = {}) {
  return {
    id: "MLB1",
    title: "Produto A",
    price: 100,
    currency_id: "BRL",
    available_quantity: 1,
    sold_quantity: 0,
    status: "active",
    permalink: "https://produto.mercadolivre.com.br/MLB-1",
    seller_custom_field: "SKU-A",
    tags: [TAG],
    ...overrides,
  };
}

function mockMl(items: Array<Record<string, unknown>>) {
  const calls: string[] = [];
  mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/items/search")) {
      const results = items.map((item) => item.id);
      return Response.json({ results, paging: { total: results.length } });
    }
    if (url.includes("/items/bulk?ids=")) {
      const ids = new URL(url).searchParams.get("ids")?.split(",") ?? [];
      return Response.json(
        items
          .filter((item) => ids.includes(String(item.id)))
          .map((body) => ({ id: body.id, status_code: 200, body })),
      );
    }
    throw new Error(`URL não mockada: ${url}`);
  });
  return calls;
}

describe("loadCatalogEligibleListings", () => {
  afterEach(() => mock.restoreAll());

  it("pede ao ML só os ativos com a tag de elegível", async () => {
    const calls = mockMl([itemBody()]);

    await loadCatalogEligibleListings("token", USER_ID);

    const search = new URL(calls[0]);
    assert.equal(search.searchParams.get("tags"), TAG);
    assert.equal(search.searchParams.get("status"), "active");
  });

  it("sem elegíveis, não busca os anúncios", async () => {
    const calls = mockMl([]);

    const payload = await loadCatalogEligibleListings("token", USER_ID);

    assert.deepEqual(payload.rows, []);
    assert.equal(payload.total, 0);
    assert.equal(calls.length, 1);
  });

  it("lista só anúncios próprios, com os mais vendidos primeiro", async () => {
    mockMl([
      itemBody({ id: "MLB1", sold_quantity: 2, seller_custom_field: "SKU-1" }),
      itemBody({ id: "MLB2", sold_quantity: 9, seller_custom_field: "SKU-2" }),
      itemBody({ id: "MLB3", sold_quantity: 99, catalog_listing: true }),
      itemBody({ id: "MLB4", sold_quantity: 50, status: "paused" }),
    ]);

    const payload = await loadCatalogEligibleListings("token", USER_ID);

    assert.deepEqual(
      payload.rows.map((row) => [row.mlItemId, row.sku, row.soldQuantity]),
      [
        ["MLB2", "SKU-2", 9],
        ["MLB1", "SKU-1", 2],
      ],
    );
    assert.equal(payload.total, 2);
  });

  it("se o ML ignorar o filtro, não diz que todo anúncio é elegível", async () => {
    mockMl([
      itemBody({ id: "MLB1" }),
      itemBody({ id: "MLB2", tags: ["good_quality_thumbnail"] }),
      itemBody({ id: "MLB3", tags: undefined }),
    ]);

    const payload = await loadCatalogEligibleListings("token", USER_ID);

    assert.deepEqual(
      payload.rows.map((row) => row.mlItemId),
      ["MLB1"],
    );
  });

  it("limita a lista, mas o total continua sendo o real", async () => {
    mockMl(
      Array.from({ length: 205 }, (_, index) =>
        itemBody({ id: `MLB${1000 + index}`, sold_quantity: index }),
      ),
    );

    const payload = await loadCatalogEligibleListings("token", USER_ID);

    assert.equal(payload.rows.length, 200);
    assert.equal(payload.total, 205);
    assert.equal(payload.rows[0].soldQuantity, 204);
  });

  it("falha do ML sobe, para o card mostrar o erro em vez de 'tudo ok'", async () => {
    mock.method(globalThis, "fetch", async () =>
      new Response("forbidden", { status: 403 }),
    );

    await assert.rejects(loadCatalogEligibleListings("token", USER_ID));
  });
});
