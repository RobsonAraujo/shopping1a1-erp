import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { loadPromotionSummary } from "@/lib/home/promotion-summary-data";

const USER_ID = 1;

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
    ...overrides,
  };
}

/**
 * Intercepta as 4 chamadas que `loadPromotionSummary` faz ao ML. `salePrice`
 * e `promotions` recebem `Response` já prontas para simular cada falha.
 */
function mockMl({
  salePrice,
  promotions,
  item = itemBody(),
}: {
  salePrice: () => Response;
  promotions?: () => Response;
  item?: Record<string, unknown>;
}) {
  const calls: string[] = [];
  mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/items/search")) {
      return Response.json({ results: [item.id], paging: { total: 1 } });
    }
    if (url.includes("/sale_price")) return salePrice();
    if (url.includes("/seller-promotions/")) {
      if (!promotions) throw new Error(`chamada inesperada: ${url}`);
      return promotions();
    }
    if (url.includes("/items?ids=")) {
      return Response.json([{ code: 200, body: item }]);
    }
    throw new Error(`URL não mockada: ${url}`);
  });
  return calls;
}

describe("loadPromotionSummary", () => {
  afterEach(() => mock.restoreAll());

  it("turns a sale_price failure into a warning instead of silently reporting no promotion", async () => {
    // Antes, `fetchItemSalePrice` recebia `item.price` como fallback e uma
    // falha do ML voltava `hasPromotion: false` sem avisar ninguém — o painel
    // dizia "nenhuma promoção vencendo" com os dados faltando.
    const calls = mockMl({
      salePrice: () => new Response("forbidden", { status: 403 }),
    });

    const payload = await loadPromotionSummary("token", USER_ID);

    assert.deepEqual(payload.expiringSoon, []);
    assert.equal(payload.warnings.length, 1);
    assert.match(payload.warnings[0], /MLB1/);
    assert.ok(
      !calls.some((url) => url.includes("/seller-promotions/")),
      "não deve consultar promoções quando o preço nem resolveu",
    );
  });

  it("lists a promotion ending within the window", async () => {
    const finishDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    mockMl({
      salePrice: () =>
        Response.json({ amount: 80, regular_amount: 100, currency_id: "BRL" }),
      promotions: () =>
        Response.json([
          {
            status: "started",
            type: "DEAL",
            name: "Oferta relâmpago",
            finish_date: finishDate.toISOString(),
          },
        ]),
    });

    const payload = await loadPromotionSummary("token", USER_ID);

    assert.equal(payload.warnings.length, 0);
    assert.equal(payload.expiringSoon.length, 1);
    assert.equal(payload.expiringSoon[0].mlItemId, "MLB1");
    assert.equal(payload.expiringSoon[0].salePrice, 80);
    assert.equal(payload.expiringSoon[0].regularPrice, 100);
    assert.equal(payload.expiringSoon[0].promotionName, "Oferta relâmpago");
  });

  it("keeps a 404 from seller-promotions as 'no active promotion', not a warning", async () => {
    mockMl({
      salePrice: () =>
        Response.json({ amount: 80, regular_amount: 100, currency_id: "BRL" }),
      promotions: () => new Response("not found", { status: 404 }),
    });

    const payload = await loadPromotionSummary("token", USER_ID);

    assert.deepEqual(payload.expiringSoon, []);
    assert.deepEqual(payload.warnings, []);
    assert.equal(payload.totalActiveItems, 1);
  });
});
