import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { act, renderIntoDocument } from "@/test-setup/render";
import { HomeWidgetCatalogoElegivel } from "@/components/home/dashboard/widgets/HomeWidgetCatalogoElegivel";
import type {
  CatalogEligiblePayload,
  CatalogEligibleRow,
} from "@/lib/home/catalog-eligible-data";
import { clearWidgetFetch } from "@/lib/home/dashboard/widget-fetch-cache";
import {
  flush,
  installImmediateIntersectionObserver,
} from "./home-dashboard-fixtures";

function row(index: number): CatalogEligibleRow {
  return {
    mlItemId: `MLB${index}`,
    title: `Produto ${index}`,
    sku: `SKU-${index}`,
    imageUrl: null,
    permalink: `https://produto.mercadolivre.com.br/MLB-${index}`,
    price: 100,
    soldQuantity: index,
  };
}

function payload(rows: CatalogEligibleRow[]): CatalogEligiblePayload {
  return { rows, total: rows.length, fetchedAt: new Date().toISOString() };
}

async function renderWidget(respond: () => Response) {
  const fetchMock = mock.method(globalThis, "fetch", async () => respond());
  const view = renderIntoDocument(<HomeWidgetCatalogoElegivel />);
  await act(async () => {
    await flush();
  });
  return { ...view, fetchMock };
}

describe("HomeWidgetCatalogoElegivel", () => {
  let restoreObserver: () => void;

  beforeEach(() => {
    clearWidgetFetch();
    restoreObserver = installImmediateIntersectionObserver();
  });

  afterEach(() => {
    restoreObserver();
    mock.restoreAll();
  });

  it("lista os anúncios elegíveis, com o total no título", async () => {
    const { container, unmount } = await renderWidget(() =>
      Response.json(payload([row(1), row(2)])),
    );
    const text = container.textContent ?? "";
    assert.match(text, /Elegíveis para catálogo/);
    assert.match(text, /SKU-1/);
    assert.match(text, /SKU-2/);
    assert.equal(
      container.querySelector("a[title]")?.getAttribute("href"),
      "https://produto.mercadolivre.com.br/MLB-1",
    );
    unmount();
  });

  it("continua na tela quando não há elegíveis", async () => {
    const { container, unmount } = await renderWidget(() =>
      Response.json(payload([])),
    );
    const text = container.textContent ?? "";
    assert.match(text, /Elegíveis para catálogo/);
    assert.match(text, /Nenhum anúncio elegível/);
    unmount();
  });

  it("mostra o erro dentro do card, sem dizer que está tudo ok", async () => {
    const { container, unmount } = await renderWidget(
      () => new Response("boom", { status: 502 }),
    );
    const text = container.textContent ?? "";
    assert.match(text, /Não foi possível carregar os anúncios elegíveis/);
    assert.doesNotMatch(text, /Nenhum anúncio elegível/);
    unmount();
  });

  it("'Ver todos' expande sem buscar de novo", async () => {
    const { container, fetchMock, unmount } = await renderWidget(() =>
      Response.json(
        payload(Array.from({ length: 7 }, (_, index) => row(index + 1))),
      ),
    );
    assert.equal(container.querySelectorAll("li").length, 5);
    const callsBefore = fetchMock.mock.calls.length;
    const more = [...container.querySelectorAll("button")].find((button) =>
      /Ver todos \(7\)/.test(button.textContent ?? ""),
    );
    assert.ok(more);
    await act(async () => {
      more.click();
      await flush();
    });
    assert.equal(container.querySelectorAll("li").length, 7);
    assert.equal(fetchMock.mock.calls.length, callsBefore);
    unmount();
  });

  it("só busca quando o card entra na viewport", async () => {
    restoreObserver();
    const fetchMock = mock.method(globalThis, "fetch", async () =>
      Response.json(payload([])),
    );
    const view = renderIntoDocument(<HomeWidgetCatalogoElegivel />);
    await act(async () => {
      await flush();
    });
    assert.equal(fetchMock.mock.calls.length, 0);
    assert.match(view.container.textContent ?? "", /Elegíveis para catálogo/);
    view.unmount();
    restoreObserver = installImmediateIntersectionObserver();
  });
});
