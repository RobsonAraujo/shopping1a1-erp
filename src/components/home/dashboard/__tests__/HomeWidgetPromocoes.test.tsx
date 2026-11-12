import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { act, renderIntoDocument } from "@/test-setup/render";
import { clearWidgetFetch } from "@/lib/home/dashboard/widget-fetch-cache";
import { sellerPromotionsUrl } from "@/lib/mercadolibre/seller-listing-url";
import { HomeWidgetPromocoes } from "@/components/home/dashboard/widgets/HomeWidgetPromocoes";
import {
  flush,
  installImmediateIntersectionObserver,
} from "./home-dashboard-fixtures";
import type {
  PromotionSummaryPayload,
  PromotionSummaryRow,
} from "@/lib/home/promotion-summary-data";

function emptyPayload(
  overrides: Partial<PromotionSummaryPayload> = {},
): PromotionSummaryPayload {
  return {
    expiringSoon: [],
    withoutPromotion: [],
    withoutPromotionCount: 0,
    totalActiveItems: 0,
    fetchedAt: new Date().toISOString(),
    expiringSoonDays: 3,
    monitor: { own: true, catalog: false },
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
    // O cache é de módulo: limpar antes E depois, senão um teste herda o
    // resultado (ou o erro) do anterior.
    clearWidgetFetch();
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
    assert.match(text, /Promoções/);
    assert.match(text, /Nenhuma promoção vencendo/);
    unmount();
  });

  it("continua na tela quando o request falha", async () => {
    const { container, unmount } = await renderWidget(
      () => new Response("boom", { status: 502 }),
    );
    const text = container.textContent ?? "";
    assert.match(text, /Promoções/);
    assert.match(text, /Não foi possível carregar o resumo de promoções/);
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
    assert.match(text, /Promoções/);
    unmount();
  });

  function row(index: number, overrides: Partial<PromotionSummaryRow> = {}): PromotionSummaryRow {
    return {
      mlItemId: `MLB${index}`,
      title: `Produto ${index}`,
      sku: `SKU-${index}`,
      imageUrl: null,
      permalink: `https://produto.mercadolivre.com.br/MLB-${index}`,
      salePrice: 100,
      regularPrice: null,
      promotionType: null,
      promotionName: null,
      promotionEndsAt: null,
      daysUntilEnd: null,
      scheduledInChain: false,
      catalogListing: false,
      soldQuantity: index,
      ...overrides,
    };
  }

  it("mostra os dois grupos: vencendo e sem promoção", async () => {
    const { container, unmount } = await renderWidget(() =>
      Response.json(
        emptyPayload({
          expiringSoon: [row(1, { daysUntilEnd: 0, promotionName: "Oferta" })],
          withoutPromotion: [row(2)],
          withoutPromotionCount: 1,
        }),
      ),
    );
    const text = container.textContent ?? "";
    assert.match(text, /Vencendo em até 3 dias/);
    assert.match(text, /SKU-1/);
    assert.match(text, /hoje/);
    assert.match(text, /Sem promoção/);
    assert.match(text, /SKU-2/);
    assert.match(text, /2 vendidos/);
    unmount();
  });

  it("leva à página de promoções do ML, e as linhas seguem abrindo o anúncio", async () => {
    const { container, unmount } = await renderWidget(() =>
      Response.json(
        emptyPayload({ expiringSoon: [row(1, { daysUntilEnd: 2, promotionName: "Oferta" })] }),
      ),
    );
    const links = [...container.querySelectorAll("a")];
    const promotions = links.find((link) => link.textContent?.includes("Abrir promoções"));
    assert.equal(promotions?.getAttribute("href"), sellerPromotionsUrl());
    assert.equal(promotions?.getAttribute("target"), "_blank");
    assert.ok(
      links.some((link) => link.getAttribute("href") === "https://produto.mercadolivre.com.br/MLB-1"),
    );
    unmount();
  });

  it("marca quando o prazo conta uma promoção programada", async () => {
    const { container, unmount } = await renderWidget(() =>
      Response.json(
        emptyPayload({
          expiringSoon: [
            row(1, { daysUntilEnd: 2, promotionName: "Oferta", scheduledInChain: true }),
            row(3, { daysUntilEnd: 1, promotionName: "Outra" }),
          ],
        }),
      ),
    );
    const text = container.textContent ?? "";
    assert.match(text, /Oferta · \+ programada/);
    assert.doesNotMatch(text, /Outra · \+ programada/);
    unmount();
  });

  it("marca os anúncios de catálogo", async () => {
    const { container, unmount } = await renderWidget(() =>
      Response.json(
        emptyPayload({
          monitor: { own: true, catalog: true },
          withoutPromotion: [row(1, { catalogListing: true }), row(2)],
          withoutPromotionCount: 2,
        }),
      ),
    );
    assert.equal(
      (container.textContent ?? "").match(/Catálogo/g)?.length,
      1,
    );
    unmount();
  });

  it("'Ver todos' expande a partir do dado já carregado, sem nova varredura", async () => {
    const rows = Array.from({ length: 8 }, (_, index) => row(index + 1));
    const { container, fetchMock, unmount } = await renderWidget(() =>
      Response.json(
        emptyPayload({ withoutPromotion: rows, withoutPromotionCount: 8 }),
      ),
    );
    assert.equal(container.querySelectorAll("li").length, 5);
    const callsBefore = fetchMock.mock.calls.length;

    const more = [...container.querySelectorAll("button")].find((button) =>
      /Ver todos \(8\)/.test(button.textContent ?? ""),
    );
    assert.ok(more, "o botão precisa existir");
    await act(async () => {
      more.click();
      await flush();
    });

    assert.equal(container.querySelectorAll("li").length, 8);
    assert.equal(fetchMock.mock.calls.length, callsBefore);
    unmount();
  });

  it("avisa quando a lista expandida não traz todos", async () => {
    const rows = Array.from({ length: 6 }, (_, index) => row(index + 1));
    const { container, unmount } = await renderWidget(() =>
      Response.json(
        emptyPayload({ withoutPromotion: rows, withoutPromotionCount: 300 }),
      ),
    );
    const more = [...container.querySelectorAll("button")].find((button) =>
      /Ver todos \(300\)/.test(button.textContent ?? ""),
    );
    assert.ok(more);
    await act(async () => {
      more.click();
      await flush();
    });
    assert.match(container.textContent ?? "", /Mostrando os 6 mais vendidos de 300/);
    unmount();
  });

  it("sem nenhum tipo monitorado, leva para as configurações", async () => {
    const { container, unmount } = await renderWidget(() =>
      Response.json(emptyPayload({ monitor: { own: false, catalog: false } })),
    );
    assert.match(container.textContent ?? "", /Nenhum tipo de anúncio monitorado/);
    assert.equal(
      container.querySelector('a[href="/dashboard/configuracoes/planejamento"]')
        ?.textContent,
      "Abrir configurações",
    );
    assert.doesNotMatch(container.textContent ?? "", /Sem promoção/);
    unmount();
  });

  it("resposta sem os campos novos não derruba a Home", async () => {
    const { container, unmount } = await renderWidget(() =>
      Response.json({
        expiringSoon: [],
        withoutPromotionCount: 0,
        totalActiveItems: 0,
        fetchedAt: new Date().toISOString(),
        expiringSoonDays: 3,
        warnings: [],
      }),
    );
    assert.match(container.textContent ?? "", /Nenhuma promoção vencendo/);
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
    assert.match(view.container.textContent ?? "", /Promoções/);
    view.unmount();
    restoreObserver = installImmediateIntersectionObserver();
  });
});
