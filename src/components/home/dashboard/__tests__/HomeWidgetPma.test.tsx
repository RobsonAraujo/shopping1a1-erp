import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { act, renderIntoDocument } from "@/test-setup/render";
import { HomeWidgetPma } from "@/components/home/dashboard/widgets/HomeWidgetPma";
import {
  flush,
  installImmediateIntersectionObserver,
} from "./home-dashboard-fixtures";
import type { PmaAlertRow } from "@/lib/home/pma-alert-data";

async function renderWidget(respond: () => Response) {
  const fetchMock = mock.method(globalThis, "fetch", async () => respond());
  const view = renderIntoDocument(<HomeWidgetPma />);
  await act(async () => {
    await flush();
  });
  return { ...view, fetchMock };
}

describe("HomeWidgetPma", () => {
  let restoreObserver: () => void;

  beforeEach(() => {
    restoreObserver = installImmediateIntersectionObserver();
  });

  afterEach(() => {
    restoreObserver();
    mock.restoreAll();
  });

  it("continua na tela quando nenhum anúncio está abaixo do PMA", async () => {
    const { container, unmount } = await renderWidget(() =>
      Response.json({ rows: [] }),
    );
    const text = container.textContent ?? "";
    assert.match(text, /Abaixo do PMA/);
    assert.match(text, /Nenhum anúncio abaixo do preço mínimo anunciável/);
    unmount();
  });

  it("continua na tela quando o request falha", async () => {
    const { container, unmount } = await renderWidget(
      () =>
        new Response(JSON.stringify({ error: "pma_alerts_failed" }), {
          status: 502,
          headers: { "content-type": "application/json" },
        }),
    );
    const text = container.textContent ?? "";
    assert.match(text, /Abaixo do PMA/);
    assert.match(text, /Não foi possível carregar os anúncios abaixo do PMA/);
    unmount();
  });

  it("lista os anúncios e o contador quando há alerta", async () => {
    const rows: PmaAlertRow[] = [
      {
        mlItemId: "MLB123",
        sku: "SKU-A",
        title: "Produto A",
        imageUrl: null,
        pmaPrice: 100,
        currentPrice: 80,
        shortfallPercent: 20,
      },
    ];
    const { container, unmount } = await renderWidget(() =>
      Response.json({ rows }),
    );
    const text = container.textContent ?? "";
    assert.match(text, /Abaixo do PMA/);
    assert.match(text, /SKU-A/);
    unmount();
  });

  it("não busca antes de o card entrar na viewport", async () => {
    restoreObserver();
    const fetchMock = mock.method(globalThis, "fetch", async () =>
      Response.json({ rows: [] }),
    );
    const view = renderIntoDocument(<HomeWidgetPma />);
    await act(async () => {
      await flush();
    });
    assert.equal(fetchMock.mock.calls.length, 0);
    view.unmount();
    restoreObserver = installImmediateIntersectionObserver();
  });
});
