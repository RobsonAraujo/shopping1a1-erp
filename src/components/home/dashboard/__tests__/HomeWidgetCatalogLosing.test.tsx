import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { act, renderIntoDocument } from "@/test-setup/render";
import { clearWidgetFetch } from "@/lib/home/dashboard/widget-fetch-cache";
import { DashboardCatalogLosingPanel } from "@/components/home/DashboardCatalogLosingPanel";
import { flush } from "./home-dashboard-fixtures";
import type { CatalogLosingRow } from "@/lib/home/catalog-losing-data";

function row(n: number): CatalogLosingRow {
  return {
    mlItemId: `MLB${n}`,
    sku: `SKU-${n}`,
    title: `Produto ${n}`,
    imageUrl: null,
    sellerPrice: 100 + n,
    priceToWin: 90,
    gap: 10 + n,
  };
}

/** 5 linhas, que é o teto de exibição do card. */
const PREVIEW = [row(1), row(2), row(3), row(4), row(5)];

function moreButton(container: HTMLElement): HTMLButtonElement | null {
  return (
    [...container.querySelectorAll("button")].find((b) =>
      (b.textContent ?? "").includes("Ver todos"),
    ) ?? null
  );
}

async function renderPanel(respond: () => Response) {
  const fetchMock = mock.method(globalThis, "fetch", async () => respond());
  const view = renderIntoDocument(
    <DashboardCatalogLosingPanel preview={PREVIEW} total={37} />,
  );
  await act(async () => {
    await flush();
  });
  return { ...view, fetchMock };
}

describe("DashboardCatalogLosingPanel", () => {
  // O cache de `useWidgetFetch` é de módulo: sem limpar, um teste herda o
  // resultado do anterior.
  beforeEach(() => clearWidgetFetch());
  afterEach(() => mock.restoreAll());

  it("não busca nada até alguém pedir a lista inteira", async () => {
    // É o ponto da mudança: antes a Home trazia TODA linha perdendo pra mostrar
    // cinco e contar o resto, em todo carregamento. Agora o resto só sai da rota
    // quando o usuário clica — e a maioria não clica.
    const { container, fetchMock, unmount } = await renderPanel(() =>
      Response.json({ rows: [], total: 0 }),
    );

    assert.equal(fetchMock.mock.callCount(), 0, "zero request no carregamento");
    assert.ok(moreButton(container), "o 'Ver todos' tem que estar visível");
    unmount();
  });

  it("o contador mostra o total, não o tamanho da prévia", async () => {
    // Com a prévia cortada em 5, contar `rows.length` faria o badge e o rótulo
    // mentirem — o número do card viria do corte, não do banco.
    const { container, unmount } = await renderPanel(() =>
      Response.json({ rows: [], total: 0 }),
    );

    const text = container.textContent ?? "";
    assert.match(text, /37/, "o total do banco aparece no card");
    assert.match(moreButton(container)?.textContent ?? "", /Ver todos \(37\)/);
    unmount();
  });

  it("clicar busca uma vez e abre a lista completa", async () => {
    const all = Array.from({ length: 12 }, (_, i) => row(i + 1));
    const { container, fetchMock, unmount } = await renderPanel(() =>
      Response.json({ rows: all, total: 12 }),
    );

    assert.doesNotMatch(
      container.textContent ?? "",
      /SKU-12/,
      "a 12ª linha não vem na prévia",
    );

    const button = moreButton(container);
    assert.ok(button);
    await act(async () => {
      button.click();
      await flush();
    });

    assert.equal(fetchMock.mock.callCount(), 1, "um request, não um por linha");
    assert.match(container.textContent ?? "", /SKU-12/, "a lista abriu");
    unmount();
  });

  it("falha ao abrir não derruba o card", async () => {
    const { container, unmount } = await renderPanel(
      () =>
        new Response(JSON.stringify({ error: "catalog_losing_failed" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
    );

    const button = moreButton(container);
    assert.ok(button);
    await act(async () => {
      button.click();
      await flush();
    });

    const text = container.textContent ?? "";
    assert.match(text, /Catálogo perdendo/, "o card continua na tela");
    assert.match(text, /SKU-1/, "e a prévia continua servindo");
    unmount();
  });
});
