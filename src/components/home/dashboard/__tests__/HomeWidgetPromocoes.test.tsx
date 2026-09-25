import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { act, renderIntoDocument } from "@/test-setup/render";
import { HomeWidgetPromocoes } from "@/components/home/dashboard/widgets/HomeWidgetPromocoes";
import {
  flush,
  installImmediateIntersectionObserver,
} from "./home-dashboard-fixtures";
import type { PromotionSummaryPayload } from "@/lib/home/promotion-summary-data";

function emptyPayload(
  overrides: Partial<PromotionSummaryPayload> = {},
): PromotionSummaryPayload {
  return {
    expiringSoon: [],
    withoutPromotionCount: 0,
    totalActiveItems: 0,
    fetchedAt: new Date().toISOString(),
    expiringSoonDays: 3,
    warnings: [],
    ...overrides,
  };
}

async function renderWidget(respond: () => Response) {
  const fetchMock = mock.method(globalThis, "fetch", async () => respond());
  const view = renderIntoDocument(<HomeWidgetPromocoes />);
  await act(async () => {
    await flush();
  });
  return { ...view, fetchMock };
}

/**
 * Regressões herdadas de `DashboardSummaryClient.test.tsx`, que este widget
 * substituiu: a seção de promoções não pode desaparecer — nem vazia, nem com
 * erro. Esconder fazia o usuário achar que o recurso não existe.
 */
describe("HomeWidgetPromocoes", () => {
  let restoreObserver: () => void;

  beforeEach(() => {
    restoreObserver = installImmediateIntersectionObserver();
  });

  afterEach(() => {
    restoreObserver();
    mock.restoreAll();
  });

  it("continua na tela quando não há nada a alertar", async () => {
    const { container, unmount } = await renderWidget(() =>
      Response.json(emptyPayload()),
    );
    const text = container.textContent ?? "";
    assert.match(text, /Promoções terminando/);
    assert.match(text, /Nenhuma promoção vencendo nos próximos dias/);
    unmount();
  });

  it("continua na tela quando o request falha", async () => {
    const { container, unmount } = await renderWidget(
      () => new Response("boom", { status: 502 }),
    );
    const text = container.textContent ?? "";
    assert.match(text, /Promoções terminando/);
    assert.match(text, /Falha ao carregar promoções|Falha de rede/);
    unmount();
  });

  it("mostra avisos de dado parcial ao lado da seção", async () => {
    const { container, unmount } = await renderWidget(() =>
      Response.json(
        emptyPayload({ warnings: ["Preço indisponível para MLB1: 429"] }),
      ),
    );
    const text = container.textContent ?? "";
    assert.match(text, /Alguns dados não chegaram/);
    assert.match(text, /Preço indisponível para MLB1: 429/);
    assert.match(text, /Promoções terminando/);
    unmount();
  });

  it("só busca quando o card entra na viewport", async () => {
    // Sem IntersectionObserver reportando visível, o widget mais lento da Home
    // não pode disparar nada — é o que mantém a Home barata pra quem não rola
    // até ele.
    restoreObserver();
    const fetchMock = mock.method(globalThis, "fetch", async () =>
      Response.json(emptyPayload()),
    );
    const view = renderIntoDocument(<HomeWidgetPromocoes />);
    await act(async () => {
      await flush();
    });
    assert.equal(fetchMock.mock.calls.length, 0);
    // e a seção segue visível, em estado de carregamento
    assert.match(view.container.textContent ?? "", /Promoções terminando/);
    view.unmount();
    restoreObserver = installImmediateIntersectionObserver();
  });
});
