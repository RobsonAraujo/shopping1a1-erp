import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { act, renderIntoDocument, waitFor } from "@/test-setup/render";
import { CalculatorPageClient } from "@/components/calculadora/CalculatorPageClient";
import {
  toCalculatorListings,
  type CalculatorData,
} from "@/lib/rotina/calculator-listings";
import type { RotinaSimulation } from "@/lib/rotina/simulate";
import { buildRotinaView } from "@/lib/rotina/view";
import { NOW, TZ, listing, settings } from "@/lib/rotina/__tests__/fixtures";

function data(): CalculatorData {
  const rows = buildRotinaView({
    now: NOW,
    timeZone: TZ,
    settings: settings(),
    health: [
      listing({ mlItemId: "MLB1", title: "Kit Escova Dental", sku: "ESC-KIT", unitsPerDay: 5 }),
      listing({ mlItemId: "MLB2", title: "Mouse Sem Fio", sku: "MOUSE-W", unitsPerDay: 1 }),
    ],
    catalogLive: [],
    targets: new Map(),
    states: [],
    lastRun: null,
    lastCompleteRunAt: "2026-11-10T09:00:00.000Z",
  }).listings;
  return {
    timeZone: TZ,
    lastCompleteRunLabel: "hoje às 06:00",
    dataIsFromToday: true,
    listings: toCalculatorListings(rows, [
      {
        mlItemId: "MLB3",
        titleSnapshot: "Lanterna Nova",
        skuSnapshot: "LANT-1",
        imageUrlSnapshot: null,
        catalogListing: false,
        mlStatus: "active",
      },
    ], () => 2),
  };
}

function simulation(price: number): RotinaSimulation {
  return {
    mlItemId: "MLB3",
    targetPercent: 2,
    inputsFrom: "live",
    inputsAt: null,
    feeRebate: null,
    currentListingTypeId: "gold_special",
    listingTypeId: "gold_special",
    salePrice: price,
    blocked: null,
    results: [
      {
        price,
        listingTypeId: "gold_special",
        quoted: true,
        marginPercent: 10,
        marginValue: 10,
        marginAfterAdsPercent: 8,
        marginAfterAdsValue: 8,
        decidingBasis: "afterAds",
        meetsTarget: true,
        lines: [],
      } as unknown as RotinaSimulation["results"][number],
    ],
  };
}

const originalFetch = globalThis.fetch;
let requests: Array<Record<string, unknown>> = [];
let urls: string[] = [];
let cleanup: (() => void) | null = null;

beforeEach(() => {
  requests = [];
  urls = [];
  window.history.replaceState(null, "", "/dashboard/calculadora");
  window.localStorage.clear();
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    requests.push(body);
    urls.push(String(input));
    if (String(input).endsWith("/floor")) {
      return new Response(
        JSON.stringify({
          mlItemId: body.mlItemId,
          listingTypeId: "gold_special",
          targetPercent: body.targetPercent,
          blocked: null,
          floor: { effectivePrice: 120, reason: "ok", bands: [] },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    const prices = body.prices as number[] | undefined;
    return new Response(JSON.stringify(simulation(prices?.[0] ?? 59.9)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
});

afterEach(() => {
  cleanup?.();
  cleanup = null;
  globalThis.fetch = originalFetch;
});

function render(initialSelectedId: string | null = null) {
  // Como na página de verdade: a URL já traz o anúncio que o servidor leu.
  if (initialSelectedId) {
    window.history.replaceState(null, "", `/dashboard/calculadora?anuncio=${initialSelectedId}`);
  }
  const rendered = renderIntoDocument(
    <CalculatorPageClient data={data()} initialSelectedId={initialSelectedId} />,
  );
  cleanup = rendered.unmount;
  return rendered.container;
}

function type(input: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setValue?.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

function key(element: Element, value: string) {
  act(() => {
    element.dispatchEvent(new window.KeyboardEvent("keydown", { key: value, bubbles: true }));
  });
}

function searchInput(container: HTMLElement) {
  const input = container.querySelector('input[role="combobox"]');
  assert.ok(input instanceof window.HTMLInputElement);
  return input;
}

function options(container: HTMLElement) {
  return [...container.querySelectorAll('[role="option"]')].map((option) => option.textContent ?? "");
}

/** O painel visível (os ocultos pelo `<Activity>` ficam com `display: none`). */
function visiblePanel(container: HTMLElement) {
  return [...container.querySelectorAll("article")].find(
    (article) => article.style.display !== "none",
  );
}

describe("CalculatorPageClient", () => {
  it("lists every listing, read or not, and searches by title words, SKU or MLB", async () => {
    const container = render();
    assert.equal(options(container).length, 3);

    type(searchInput(container), "dental kit");
    await waitFor(() => assert.equal(options(container).length, 1));
    assert.match(options(container)[0], /Kit Escova Dental/);

    type(searchInput(container), "mouse-w");
    await waitFor(() => assert.match(options(container).join(" "), /Mouse Sem Fio/));
    assert.equal(options(container).length, 1);

    type(searchInput(container), "mlb-3");
    await waitFor(() => assert.match(options(container)[0] ?? "", /Lanterna Nova/));
    assert.match(options(container)[0], /sem leitura/);
  });

  it("opens the calculator with the keyboard without calling the ML, and simulates on Enter", async () => {
    const container = render();
    const search = searchInput(container);
    key(search, "ArrowDown");
    key(search, "Enter");

    await waitFor(() => assert.match(window.location.search, /anuncio=MLB2/));
    const panel = visiblePanel(container);
    assert.ok(panel, "a calculadora não abriu");
    assert.match(panel.textContent ?? "", /Mouse Sem Fio/);
    // A faixa "Hoje" vem do retrato: nenhuma cotação ao escolher.
    assert.match(panel.textContent ?? "", /Hoje/);
    assert.equal(requests.length, 0);

    const form = panel.querySelector("form");
    assert.ok(form);
    const price = form.querySelector("input") as HTMLInputElement;
    assert.equal(price.value, "100,00");
    type(price, "89,90");
    await act(async () => {
      form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    });
    await waitFor(() => assert.equal(requests.length, 1));
    assert.deepEqual(requests[0], { mlItemId: "MLB2", prices: [89.9] });
  });

  it("asks the server for today's price on a listing the Central never read", async () => {
    const container = render("MLB3");
    const panel = visiblePanel(container);
    assert.ok(panel);
    assert.match(panel.textContent ?? "", /ainda não passou pelo Atualizar/);
    assert.equal(requests.length, 0);

    const button = [...panel.querySelectorAll("button")].find(
      (candidate) => candidate.textContent === "Calcular no preço de hoje",
    );
    assert.ok(button);
    await act(async () => {
      button.click();
    });
    await waitFor(() => assert.equal(requests.length, 1));
    assert.deepEqual(requests[0], { mlItemId: "MLB3" });
    await waitFor(() =>
      assert.equal((panel.querySelector("form input") as HTMLInputElement).value, "59,90"),
    );
  });

  it("keeps a recent calculator alive: coming back does not quote again", async () => {
    const container = render("MLB1");
    let panel = visiblePanel(container);
    assert.ok(panel);
    const form = panel.querySelector("form") as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    });
    await waitFor(() => assert.equal(requests.length, 1));

    // Troca para outro anúncio e volta pelo recente.
    const other = [...container.querySelectorAll('[role="option"]')].find((option) =>
      option.textContent?.includes("Mouse Sem Fio"),
    ) as HTMLElement;
    act(() => other.click());
    await waitFor(() => assert.match(window.location.search, /anuncio=MLB2/));
    const back = [...container.querySelectorAll('[role="option"]')].find((option) =>
      option.textContent?.includes("Kit Escova Dental"),
    ) as HTMLElement;
    act(() => back.click());
    await waitFor(() => assert.match(window.location.search, /anuncio=MLB1/));

    panel = visiblePanel(container);
    assert.ok(panel);
    assert.match(panel.textContent ?? "", /Kit Escova Dental/);
    // O resultado de antes continua na tela, sem nova consulta.
    assert.match(panel.textContent ?? "", /A R\$\s?100,00/);
    assert.equal(requests.length, 1);
  });

  it("lets the user play with the accepted margin: the verdict changes without quoting", async () => {
    const container = render("MLB2");
    const panel = visiblePanel(container);
    assert.ok(panel);
    const form = panel.querySelector("form") as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    });
    await waitFor(() => assert.match(panel.textContent ?? "", /dentro do mínimo de 2%/));
    assert.equal(requests.length, 1);

    // A margem abre na meta da Central (2%); subir para 10% muda o veredito na hora.
    const target = panel.querySelector(
      'input[inputmode="decimal"]:not(form input)',
    ) as HTMLInputElement;
    assert.equal(target.value, "2");
    type(target, "10");
    await waitFor(() => assert.match(panel.textContent ?? "", /abaixo do mínimo de 10%/));
    assert.equal(requests.length, 1, "mudar a margem não pode cotar no ML");
    assert.match(panel.textContent ?? "", /Meta da Central: 2%/);

    // O mínimo da rodada vale para 2%: para 10% ele sai só quando o usuário pede.
    assert.doesNotMatch(panel.textContent ?? "", /Mínimo R\$/);
    const compute = [...panel.querySelectorAll("button")].find(
      (button) => button.textContent === "Calcular mínimo p/ 10%",
    );
    assert.ok(compute, "falta o botão de calcular o mínimo para a margem escolhida");
    await act(async () => {
      compute.click();
    });
    await waitFor(() => assert.match(panel.textContent ?? "", /Mínimo p\/ 10%\s*R\$\s?120,00/));
    assert.equal(urls[1], "/api/rotina/simulate/floor");
    assert.deepEqual(requests[1], { mlItemId: "MLB2", targetPercent: 10 });

    // "voltar" devolve a meta da Central e o mínimo da rodada.
    const reset = [...panel.querySelectorAll("button")].find(
      (button) => button.textContent === "voltar",
    );
    assert.ok(reset);
    act(() => reset.click());
    await waitFor(() => assert.match(panel.textContent ?? "", /dentro do mínimo de 2%/));
    assert.equal(target.value, "2");
    assert.equal(requests.length, 2);
  });
});
