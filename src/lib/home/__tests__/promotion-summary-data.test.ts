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

/**
 * Vários anúncios de uma vez. `salePrice` recebe o id para cada anúncio poder
 * responder diferente.
 */
function mockMlItems({
  items,
  salePrice,
}: {
  items: Array<Record<string, unknown>>;
  salePrice: (id: string) => Response;
}) {
  const calls: string[] = [];
  mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/items/search")) {
      const onlyCatalog = url.includes("catalog_listing=true");
      const results = items
        .filter((item) => !onlyCatalog || item.catalog_listing === true)
        .map((item) => item.id);
      return Response.json({ results, paging: { total: results.length } });
    }
    const priceMatch = url.match(/\/items\/([^/]+)\/sale_price/);
    if (priceMatch) return salePrice(priceMatch[1]);
    if (url.includes("/items?ids=")) {
      const ids = new URL(url).searchParams.get("ids")?.split(",") ?? [];
      return Response.json(
        items
          .filter((item) => ids.includes(String(item.id)))
          .map((body) => ({ code: 200, body })),
      );
    }
    throw new Error(`URL não mockada: ${url}`);
  });
  return calls;
}

const NO_PROMOTION = () => Response.json({ amount: 100, regular_amount: null });

describe("loadPromotionSummary: anúncios monitorados e sem promoção", () => {
  afterEach(() => mock.restoreAll());

  const own = itemBody({ id: "MLB1", sold_quantity: 5 });
  const catalog = itemBody({
    id: "MLB2",
    catalog_listing: true,
    sold_quantity: 50,
    seller_custom_field: "SKU-B",
  });

  it("por padrão acompanha só os próprios, como sempre foi", async () => {
    mockMlItems({ items: [own, catalog], salePrice: NO_PROMOTION });

    const payload = await loadPromotionSummary("token", USER_ID);

    assert.deepEqual(payload.monitor, { own: true, catalog: false });
    assert.deepEqual(
      payload.withoutPromotion.map((row) => row.mlItemId),
      ["MLB1"],
    );
    assert.equal(payload.totalActiveItems, 1);
  });

  it("com os dois ligados, marca o que é catálogo e ordena por mais vendidos", async () => {
    mockMlItems({ items: [own, catalog], salePrice: NO_PROMOTION });

    const payload = await loadPromotionSummary("token", USER_ID, {
      monitor: { own: true, catalog: true },
    });

    assert.deepEqual(
      payload.withoutPromotion.map((row) => [
        row.mlItemId,
        row.catalogListing,
        row.soldQuantity,
      ]),
      [
        ["MLB2", true, 50],
        ["MLB1", false, 5],
      ],
    );
    assert.equal(payload.withoutPromotionCount, 2);
  });

  it("só catálogo filtra já na busca, sem consultar os próprios", async () => {
    const calls = mockMlItems({ items: [own, catalog], salePrice: NO_PROMOTION });

    const payload = await loadPromotionSummary("token", USER_ID, {
      monitor: { own: false, catalog: true },
    });

    assert.ok(calls.some((url) => url.includes("catalog_listing=true")));
    assert.ok(!calls.some((url) => url.includes("/MLB1/sale_price")));
    assert.deepEqual(
      payload.withoutPromotion.map((row) => row.mlItemId),
      ["MLB2"],
    );
  });

  it("só próprios não filtra a busca: catalog_listing=false nunca foi validado", async () => {
    const calls = mockMlItems({ items: [own, catalog], salePrice: NO_PROMOTION });

    await loadPromotionSummary("token", USER_ID, {
      monitor: { own: true, catalog: false },
    });

    assert.ok(!calls.some((url) => url.includes("catalog_listing=")));
  });

  it("com os dois desligados não faz nenhuma chamada ao Mercado Livre", async () => {
    const calls = mockMlItems({ items: [own, catalog], salePrice: NO_PROMOTION });

    const payload = await loadPromotionSummary("token", USER_ID, {
      monitor: { own: false, catalog: false },
    });

    assert.equal(calls.length, 0);
    assert.deepEqual(payload.withoutPromotion, []);
    assert.deepEqual(payload.monitor, { own: false, catalog: false });
  });

  it("consulta que falha não conta como sem promoção", async () => {
    mockMlItems({
      items: [own, itemBody({ id: "MLB3" })],
      salePrice: (id) =>
        id === "MLB3"
          ? new Response("forbidden", { status: 403 })
          : NO_PROMOTION(),
    });

    const payload = await loadPromotionSummary("token", USER_ID);

    assert.equal(payload.withoutPromotionCount, 1);
    assert.deepEqual(
      payload.withoutPromotion.map((row) => row.mlItemId),
      ["MLB1"],
    );
    assert.equal(payload.warnings.length, 1);
    assert.match(payload.warnings[0], /MLB3/);
  });

  it("não repete a consulta sob 429: na varredura isso só amplia a carga", async () => {
    const calls = mockMlItems({
      items: [own],
      salePrice: () => new Response("slow down", { status: 429 }),
    });

    const payload = await loadPromotionSummary("token", USER_ID);

    assert.equal(
      calls.filter((url) => url.includes("/sale_price")).length,
      1,
    );
    assert.equal(payload.withoutPromotionCount, 0);
  });

  it("passou do orçamento de tempo: para de consultar e avisa que é parcial", async () => {
    const calls = mockMlItems({ items: [own], salePrice: NO_PROMOTION });

    const payload = await loadPromotionSummary("token", USER_ID, {
      scanBudgetMs: 0,
    });

    assert.ok(!calls.some((url) => url.includes("/sale_price")));
    assert.match(payload.warnings[0], /0 de 1 anúncios/);
    assert.equal(payload.withoutPromotionCount, 0);
  });

  it("limita a lista, mas o total continua sendo o real", async () => {
    const items = Array.from({ length: 205 }, (_, index) =>
      itemBody({ id: `MLB${1000 + index}`, sold_quantity: index }),
    );
    mockMlItems({ items, salePrice: NO_PROMOTION });

    const payload = await loadPromotionSummary("token", USER_ID);

    assert.equal(payload.withoutPromotion.length, 200);
    assert.equal(payload.withoutPromotionCount, 205);
    assert.equal(payload.withoutPromotion[0].soldQuantity, 204);
  });
});
