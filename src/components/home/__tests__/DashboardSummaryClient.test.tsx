import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { act, renderIntoDocument } from "@/test-setup/render";
import { DashboardSummaryClient } from "../DashboardSummaryClient";
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

async function renderSummary(respond: () => Response) {
  mock.method(globalThis, "fetch", async () => respond());
  const view = renderIntoDocument(<DashboardSummaryClient pmaRows={[]} />);
  // deixa o useEffect resolver o fetch antes de olhar o DOM
  await act(async () => {
    await Promise.resolve();
  });
  return view;
}

describe("DashboardSummaryClient", () => {
  afterEach(() => mock.restoreAll());

  it("keeps both sections on screen when there is nothing to alert", async () => {
    // Regressão: antes o componente devolvia `null` quando PMA e promoções
    // estavam vazios junto com o painel de catálogo perdendo — os dois blocos
    // sumiam da home e o usuário achava que o recurso não existia.
    const { container, unmount } = await renderSummary(() =>
      Response.json(emptyPayload()),
    );

    const text = container.textContent ?? "";
    assert.match(text, /Abaixo do PMA/);
    assert.match(text, /Nenhum anúncio abaixo do preço mínimo anunciável/);
    assert.match(text, /Promoções terminando/);
    assert.match(text, /Nenhuma promoção vencendo nos próximos dias/);
    unmount();
  });

  it("keeps the promotions section on screen when the request fails", async () => {
    const { container, unmount } = await renderSummary(
      () => new Response("boom", { status: 502 }),
    );

    const text = container.textContent ?? "";
    assert.match(text, /Promoções terminando/);
    assert.match(text, /Falha de rede ao carregar promoções/);
    // a seção de PMA não pode ser derrubada junto com o erro das promoções
    assert.match(text, /Abaixo do PMA/);
    unmount();
  });

  it("surfaces partial-data warnings alongside the section", async () => {
    const { container, unmount } = await renderSummary(() =>
      Response.json(
        emptyPayload({ warnings: ["Preço indisponível para MLB1: 429"] }),
      ),
    );

    const text = container.textContent ?? "";
    assert.match(text, /Alguns dados não chegaram/);
    assert.match(text, /MLB1/);
    assert.match(text, /Promoções terminando/);
    unmount();
  });
});
