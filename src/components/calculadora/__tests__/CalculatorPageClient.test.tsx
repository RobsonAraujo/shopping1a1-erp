import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { act, renderIntoDocument, waitFor } from "@/test-setup/render";
import { CalculatorPageClient } from "@/components/calculadora/CalculatorPageClient";
import {
  toCalculatorListings,
  type CalculatorData,
} from "@/lib/calculadora/calculator-listings";
import type { CalculatorAds, CalculatorReading } from "@/lib/calculadora/reading";
import type { RotinaSimulation } from "@/lib/rotina/simulate";
import { simulateMarginAtPrice } from "@/lib/rotina/simulate-margin";
import type { RotinaPricingInputs } from "@/lib/rotina/types";

const TZ = "America/Sao_Paulo";

function data(): CalculatorData {
  return {
    timeZone: TZ,
    listings: toCalculatorListings([
      {
        mlItemId: "MLB1",
        titleSnapshot: "Kit Escova Dental",
        skuSnapshot: "ESC-KIT",
        imageUrlSnapshot: null,
        catalogListing: false,
        mlStatus: "active",
      },
      {
        mlItemId: "MLB2",
        titleSnapshot: "Mouse Sem Fio",
        skuSnapshot: "MOUSE-W",
        imageUrlSnapshot: null,
        catalogListing: false,
        mlStatus: "active",
      },
      {
        mlItemId: "MLB3",
        titleSnapshot: "Lanterna Nova",
        skuSnapshot: "LANT-1",
        imageUrlSnapshot: null,
        catalogListing: false,
        mlStatus: "paused",
      },
    ]),
  };
}

function ads(basis: CalculatorAds["basis"], overrides: Partial<CalculatorAds> = {}): CalculatorAds {
  return {
    basis,
    from: basis === "today" ? "2026-11-18" : "2026-11-12",
    to: "2026-11-18",
    available: true,
    tacosPercent: basis === "today" ? 4 : 8,
    adsCost: 8,
    adsUnitsSold: 2,
    status: "active",
    ...overrides,
  };
}

/**
 * Preço 100, taxa 12, frete 0, custo 50, imposto 10% → MC 28%; TACOS hoje 4%,
 * 7 dias 8%. O custo 50 é R$ 40,00 na NF + IPI de 25%.
 */
function reading(mlItemId: string, overrides: Partial<CalculatorReading> = {}): CalculatorReading {
  return {
    mlItemId,
    readAt: "2026-11-18T17:32:00.000Z",
    listingTypeId: "gold_special",
    price: 100,
    regularPrice: null,
    hasPromotion: false,
    promotionKnown: true,
    pmaPrice: null,
    costsNow: { mlFeeAmount: 12, shippingCost: 0 },
    inputs: {
      productCost: 50,
      extraCosts: 0,
      taxRatePercent: 10,
      mlFeeRebate: null,
      listingTypeId: "gold_special",
      listingTypeLabel: "Clássico",
      adsMetricsAvailable: true,
      tacosPercent: 4,
      adsCost: 8,
      adsUnitsSold: 2,
    },
    taxSource: { regime: "report", window: { from: "2026-10-19", to: "2026-11-17" } },
    blocked: null,
    catalog: null,
    targetPercent: 2,
    ownTarget: false,
    ads: ads("today"),
    purchaseBasis: { kind: "nf", unitCostNf: 40, ipiPercent: 25, stFactor: null, units: 1 },
    ...overrides,
  };
}

const originalFetch = globalThis.fetch;
let requests: Array<{ url: string; body: Record<string, unknown> }> = [];
let readingOverrides: Partial<CalculatorReading> = {};
let cleanup: (() => void) | null = null;

function json(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  requests = [];
  readingOverrides = {};
  window.history.replaceState(null, "", "/dashboard/calculadora");
  window.localStorage.clear();
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    requests.push({ url, body });
    const mlItemId = String(body.mlItemId);
    if (url.endsWith("/read")) return json(reading(mlItemId, readingOverrides));
    if (url.endsWith("/ads")) return json(ads("7d"));
    if (url.endsWith("/floor")) {
      return json({
        mlItemId,
        listingTypeId: "gold_special",
        targetPercent: body.targetPercent,
        blocked: null,
        floor: {
          effectivePrice: 120,
          reason: "ok",
          bands: [],
          boundBy: "margin",
          maxDiscountPercent: null,
          discountBase: null,
        },
      });
    }
    // Simulação: a mesma conta do servidor, com os insumos que o navegador mandou.
    const prices = body.prices as number[];
    const inputs = body.inputs as RotinaPricingInputs;
    const simulation: RotinaSimulation = {
      mlItemId,
      targetPercent: Number(body.targetPercent),
      inputsFrom: "live",
      inputsAt: String(body.readAt),
      feeRebate: null,
      currentListingTypeId: "gold_special",
      listingTypeId: "gold_special",
      salePrice: Number(body.salePrice),
      blocked: null,
      // Como o servidor: os insumos voltam, para o navegador refazer a conta.
      inputs,
      results: prices.map((price) =>
        simulateMarginAtPrice(
          price,
          { mlFeeAmount: Math.round(price * 12) / 100, shippingCost: 0 },
          inputs,
          Number(body.targetPercent),
        ),
      ),
    };
    return json(simulation);
  }) as typeof fetch;
});

afterEach(() => {
  cleanup?.();
  cleanup = null;
  globalThis.fetch = originalFetch;
});

function render(initialSelectedId: string | null = null, pageData: CalculatorData = data()) {
  // Como na página de verdade: a URL já traz o anúncio que o servidor leu.
  if (initialSelectedId) {
    window.history.replaceState(null, "", `/dashboard/calculadora?anuncio=${initialSelectedId}`);
  }
  const rendered = renderIntoDocument(
    <CalculatorPageClient data={pageData} initialSelectedId={initialSelectedId} />,
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

/** A faixa "Agora" do painel, depois da leitura. */
async function nowStrip(panel: HTMLElement) {
  await waitFor(() => assert.ok(panel.querySelector('section[aria-label="Agora"]')));
  return panel.querySelector('section[aria-label="Agora"]') as HTMLElement;
}

function buttonByText(root: HTMLElement, text: string) {
  return [...root.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.trim() === text,
  );
}

async function submit(panel: HTMLElement) {
  const form = panel.querySelector("form") as HTMLFormElement;
  await act(async () => {
    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  });
}

const count = (suffix: string) => requests.filter((request) => request.url.endsWith(suffix)).length;

describe("CalculatorPageClient", () => {
  it("lists every listing by title and searches by title words, SKU or MLB", async () => {
    const container = render();
    assert.deepEqual(
      options(container).map((option) => option.match(/Kit Escova|Lanterna|Mouse/)?.[0]),
      ["Kit Escova", "Lanterna", "Mouse"],
    );

    type(searchInput(container), "dental kit");
    await waitFor(() => assert.equal(options(container).length, 1));
    assert.match(options(container)[0], /Kit Escova Dental/);

    type(searchInput(container), "mouse-w");
    await waitFor(() => assert.match(options(container).join(" "), /Mouse Sem Fio/));
    assert.equal(options(container).length, 1);

    type(searchInput(container), "mlb-3");
    await waitFor(() => assert.match(options(container)[0] ?? "", /Lanterna Nova/));
    assert.match(options(container)[0], /pausado/);
    // A lista é só banco: nenhuma leitura enquanto busca.
    assert.equal(requests.length, 0);
  });

  it("reads the listing once when it opens (not on ↑/↓), and simulates with the reading's inputs", async () => {
    const container = render();
    const search = searchInput(container);
    key(search, "ArrowDown");
    assert.equal(requests.length, 0, "navegar na lista não pode ler o anúncio");
    key(search, "Enter");

    await waitFor(() => assert.match(window.location.search, /anuncio=MLB3/));
    const panel = visiblePanel(container);
    assert.ok(panel, "a calculadora não abriu");
    const strip = await nowStrip(panel);
    assert.equal(count("/read"), 1);
    assert.deepEqual(requests[0].body, { mlItemId: "MLB3" });
    // MC 28%, após ADS com o TACOS de hoje (4%) = 24%; imposto com a janela.
    assert.match(strip.textContent ?? "", /28%/);
    assert.match(strip.textContent ?? "", /24%/);
    assert.match(strip.textContent ?? "", /hoje até/);
    assert.match(strip.textContent ?? "", /30 dias · até 17\/11/);

    const price = panel.querySelector("form input") as HTMLInputElement;
    assert.equal(price.value, "100,00");
    type(price, "89,90");
    await submit(panel);
    await waitFor(() => assert.equal(count("/simulate"), 1));
    const sent = requests.find((request) => request.url.endsWith("/simulate"))!;
    assert.equal(sent.url, "/api/calculadora/simulate");
    assert.deepEqual(sent.body.prices, [89.9]);
    assert.equal((sent.body.inputs as RotinaPricingInputs).tacosPercent, 4);
    assert.equal(sent.body.salePrice, 100);
  });

  it("switches the TACOS to 7 days with one read, and redoes the margins without quoting", async () => {
    const container = render("MLB1");
    const panel = visiblePanel(container);
    assert.ok(panel);
    const strip = await nowStrip(panel);
    await submit(panel);
    await waitFor(() => assert.equal(count("/simulate"), 1));
    // A R$ 100: MC 28%, após ADS 24% (hoje).
    await waitFor(() => assert.match(panel.textContent ?? "", /A R\$\s?100,00/));

    const week = buttonByText(strip, "7 dias");
    assert.ok(week, "falta a opção de TACOS de 7 dias");
    await act(async () => week.click());
    await waitFor(() => assert.match(strip.textContent ?? "", /7 dias · 12\/11–18\/11/));
    assert.equal(count("/ads"), 1);
    // Após ADS = 28% − 8% na faixa e no preço já simulado, sem nova cotação.
    assert.match(strip.textContent ?? "", /20%/);
    assert.doesNotMatch(strip.textContent ?? "", /24%/);
    assert.equal(count("/simulate"), 1, "trocar a base não pode cotar no ML");

    const today = buttonByText(strip, "Hoje");
    assert.ok(today);
    act(() => today.click());
    await waitFor(() => assert.match(strip.textContent ?? "", /24%/));
    assert.equal(count("/ads"), 1, "voltar para hoje não lê nada");
  });

  it("says when today's ADS spent without selling, and decides by MC", async () => {
    readingOverrides = { ads: ads("today", { tacosPercent: null, adsCost: 4.2, adsUnitsSold: 0 }) };
    const container = render("MLB2");
    const panel = visiblePanel(container);
    assert.ok(panel);
    const strip = await nowStrip(panel);
    assert.match(strip.textContent ?? "", /R\$\s?4,20 de ADS e nenhuma venda ainda/);
    const useWeek = buttonByText(strip, "Usar o TACOS de 7 dias");
    assert.ok(useWeek);
    await act(async () => useWeek.click());
    await waitFor(() => assert.equal(count("/ads"), 1));
  });

  it("keeps a recent calculator alive: coming back does not read or quote again", async () => {
    const container = render("MLB1");
    let panel = visiblePanel(container);
    assert.ok(panel);
    await nowStrip(panel);
    await submit(panel);
    await waitFor(() => assert.equal(count("/simulate"), 1));

    // Troca para outro anúncio e volta pelo recente.
    const other = [...container.querySelectorAll('[role="option"]')].find((option) =>
      option.textContent?.includes("Mouse Sem Fio"),
    ) as HTMLElement;
    await act(async () => other.click());
    await waitFor(() => assert.match(window.location.search, /anuncio=MLB2/));
    await waitFor(() => assert.equal(count("/read"), 2));
    const back = [...container.querySelectorAll('[role="option"]')].find((option) =>
      option.textContent?.includes("Kit Escova Dental"),
    ) as HTMLElement;
    act(() => back.click());
    await waitFor(() => assert.match(window.location.search, /anuncio=MLB1/));

    panel = visiblePanel(container);
    assert.ok(panel);
    assert.match(panel.textContent ?? "", /Kit Escova Dental/);
    // O resultado de antes continua na tela, sem nova leitura nem cotação.
    assert.match(panel.textContent ?? "", /A R\$\s?100,00/);
    assert.equal(count("/read"), 2);
    assert.equal(count("/simulate"), 1);
  });

  it("lets the user play with the accepted margin, and computes the minimum on demand", async () => {
    const container = render("MLB2");
    const panel = visiblePanel(container);
    assert.ok(panel);
    await nowStrip(panel);
    await submit(panel);
    await waitFor(() => assert.match(panel.textContent ?? "", /dentro do mínimo de 2%/));
    assert.equal(count("/simulate"), 1);

    // A margem abre na meta que vale (2%); subir para 30% muda o veredito na hora.
    const target = panel.querySelector(
      'input[inputmode="decimal"]:not(form input)',
    ) as HTMLInputElement;
    assert.equal(target.value, "2");
    type(target, "30");
    await waitFor(() => assert.match(panel.textContent ?? "", /abaixo do mínimo de 30%/));
    assert.equal(count("/simulate"), 1, "mudar a margem não pode cotar no ML");

    // Sem mínimo pronto: ele sai só quando o usuário pede.
    assert.doesNotMatch(panel.textContent ?? "", /Mínimo p\/ 30%\s*R\$/);
    const compute = buttonByText(panel, "Calcular mínimo p/ 30%");
    assert.ok(compute, "falta o botão de calcular o mínimo para a margem escolhida");
    await act(async () => compute.click());
    await waitFor(() => assert.match(panel.textContent ?? "", /Mínimo p\/ 30%\s*R\$\s?120,00/));
    const floor = requests.find((request) => request.url.endsWith("/floor"))!;
    assert.equal(floor.url, "/api/calculadora/floor");
    assert.equal(floor.body.targetPercent, 30);
    assert.equal((floor.body.inputs as RotinaPricingInputs).tacosPercent, 4);

    // Na meta que vale também há "Calcular mínimo" (não há mínimo de rodada).
    const reset = buttonByText(panel, "voltar");
    assert.ok(reset);
    act(() => reset.click());
    await waitFor(() => assert.match(panel.textContent ?? "", /dentro do mínimo de 2%/));
    assert.ok(buttonByText(panel, "Calcular mínimo"));
  });

  it("shows the PMA, offers it as a shortcut and warns on prices below it", async () => {
    readingOverrides = { pmaPrice: 110 };
    const container = render("MLB1");
    const panel = visiblePanel(container);
    assert.ok(panel);
    const strip = await nowStrip(panel);
    // Preço de agora 100 < PMA 110: a faixa avisa, como a tarefa "Subir para o PMA".
    assert.match(strip.textContent ?? "", /Abaixo do PMA\s*R\$\s?110,00/);

    await submit(panel);
    await waitFor(() => assert.match(panel.textContent ?? "", /A R\$\s?100,00/));
    assert.match(panel.textContent ?? "", /Abaixo do PMA de R\$\s?110,00 · faltam R\$\s?10,00/);
    // Só avisa: a margem e o veredito da meta continuam.
    assert.match(panel.textContent ?? "", /dentro do mínimo de 2%/);

    const shortcuts = panel.querySelector('[aria-label="Atalhos de preço"]') as HTMLElement;
    const pma = [...shortcuts.querySelectorAll("button")].find((button) =>
      /^PMA\s*R\$\s?110,00$/.test(button.textContent?.trim() ?? ""),
    );
    assert.ok(pma, "falta o atalho do PMA");
    await act(async () => pma.click());
    await waitFor(() => assert.equal(count("/simulate"), 2));
    await waitFor(() => assert.match(panel.textContent ?? "", /A R\$\s?110,00/));
    assert.doesNotMatch(panel.textContent ?? "", /Abaixo do PMA de/);
    // O preço de antes, abaixo do PMA, segue marcado no Comparar.
    const compare = panel.querySelector("ul") as HTMLElement;
    assert.match(compare.textContent ?? "", /abaixo do PMA/);
  });

  it("shows the PMA without a warning when today's price is at or above it", async () => {
    readingOverrides = { pmaPrice: 90 };
    const container = render("MLB1");
    const panel = visiblePanel(container);
    assert.ok(panel);
    const strip = await nowStrip(panel);
    assert.match(strip.textContent ?? "", /PMA\s*R\$\s?90,00/);
    assert.doesNotMatch(strip.textContent ?? "", /Abaixo do PMA/);
    await submit(panel);
    await waitFor(() => assert.match(panel.textContent ?? "", /A R\$\s?100,00/));
    assert.doesNotMatch(panel.textContent ?? "", /abaixo do PMA/i);
  });

  it("says how much to pay at each price, and redoes the margin with a supplier quote without quoting", async () => {
    const container = render("MLB1");
    const panel = visiblePanel(container);
    assert.ok(panel);
    await nowStrip(panel);
    await submit(panel);
    await waitFor(() => assert.match(panel.textContent ?? "", /A R\$\s?100,00/));

    // A R$ 100 com meta de 2%: 100 − 12 − 10 − 4 (ADS) − 2 = 72 na conta = R$ 57,60 na NF (IPI 25%).
    const text = () => (panel.textContent ?? "").replace(/\u00a0/g, " ");
    assert.match(text(), /pague até\s*R\$ 57,60\s*\/un na NF/);
    assert.match(text(), /custo na conta R\$ 72,00 \(IPI 25%\)/);
    assert.match(text(), /empate \(0%\) até R\$ 59,20/);
    assert.match(text(), /cadastro hoje R\$ 40,00/);

    const label = [...panel.querySelectorAll("label")].find(
      (candidate) => candidate.textContent === "Custo do orçamento",
    );
    assert.ok(label, "falta o campo do custo do orçamento");
    const quote = document.getElementById(label.htmlFor) as HTMLInputElement;

    // O limite exato fecha a meta: após ADS = 2%.
    type(quote, "57,60");
    await waitFor(() => assert.match(text(), /dentro do mínimo de 2%/));
    assert.match(text(), /Na conta: R\$ 72,00 \(IPI 25%\)/);
    assert.match(text(), /é exatamente o limite/);

    // Acima do limite: R$ 60 na NF = 75 na conta → após ADS −1%.
    type(quote, "60");
    await waitFor(() => assert.match(text(), /abaixo do mínimo de 2%/));
    assert.match(text(), /passa R\$ 2,40 do limite: negocie até R\$ 57,60/);
    assert.match(text(), /Custo do orçamento \(R\$ 75,00 na conta\)/);
    assert.equal(count("/simulate"), 1, "o orçamento não pode cotar no ML");

    // O mínimo sai com o custo do orçamento.
    const compute = buttonByText(panel, "Calcular mínimo");
    assert.ok(compute);
    await act(async () => compute.click());
    await waitFor(() => assert.equal(count("/floor"), 1));
    const floor = requests.find((request) => request.url.endsWith("/floor"))!;
    assert.equal((floor.body.inputs as RotinaPricingInputs).productCost, 75);

    // Limpar volta ao custo do cadastro.
    const clear = buttonByText(panel, "limpar");
    assert.ok(clear);
    act(() => clear.click());
    await waitFor(() => assert.match(text(), /dentro do mínimo de 2%/));
    assert.doesNotMatch(text(), /negocie até/);

    // Para compra, o TACOS de hoje sugere o de 7 dias.
    const week = buttonByText(panel, "usar 7 dias");
    assert.ok(week, "falta a sugestão do TACOS de 7 dias para compra");
    await act(async () => week.click());
    await waitFor(() => assert.equal(count("/ads"), 1));
  });

  it("shows a product with sale options once, opens its options and switches between them", async () => {
    const both = { principalMlItemId: "MLB10", optionsLabel: "Clássico + Premium" };
    const withOptions: CalculatorData = {
      timeZone: TZ,
      listings: toCalculatorListings(
        [
          {
            mlItemId: "MLB10",
            titleSnapshot: "Cabo Ninja 3m",
            skuSnapshot: "NINJA-3",
            imageUrlSnapshot: null,
            catalogListing: true,
            mlStatus: "active",
          },
          {
            mlItemId: "MLB11",
            titleSnapshot: "Cabo Ninja 3m",
            skuSnapshot: "NINJA-3",
            imageUrlSnapshot: null,
            catalogListing: true,
            mlStatus: "active",
          },
          {
            mlItemId: "MLB2",
            titleSnapshot: "Mouse Sem Fio",
            skuSnapshot: "MOUSE-W",
            imageUrlSnapshot: null,
            catalogListing: false,
            mlStatus: "active",
          },
        ],
        new Map([
          ["MLB10", { ...both, label: "Clássico" }],
          ["MLB11", { ...both, label: "Premium" }],
        ]),
      ),
    };
    const container = render(null, withOptions);

    // O produto aparece uma vez, fechado; clicar abre as opções (sem ler o anúncio).
    assert.equal(options(container).length, 2);
    const product = [...container.querySelectorAll('[role="option"]')].find((option) =>
      option.textContent?.includes("2 opções"),
    ) as HTMLElement;
    assert.ok(product);
    assert.match(product.textContent ?? "", /Clássico \+ Premium/);
    act(() => product.click());
    await waitFor(() => assert.equal(options(container).length, 4));
    assert.equal(requests.length, 0);

    // Escolher a Premium abre a calculadora dela.
    const premium = [...container.querySelectorAll('[role="option"]')].find((option) =>
      option.textContent?.includes("MLB11"),
    ) as HTMLElement;
    await act(async () => premium.click());
    await waitFor(() => assert.match(window.location.search, /anuncio=MLB11/));
    let panel = visiblePanel(container);
    assert.ok(panel);
    await nowStrip(panel);

    // A troca no cabeçalho passa para a Clássico, sem voltar à lista.
    const tab = [...panel.querySelectorAll('[role="tab"]')].find(
      (candidate) => candidate.textContent?.trim() === "Clássico",
    ) as HTMLElement;
    assert.ok(tab);
    await act(async () => tab.click());
    await waitFor(() => assert.match(window.location.search, /anuncio=MLB10/));
    panel = visiblePanel(container);
    assert.ok(panel);
    assert.match(panel.textContent ?? "", /MLB10/);

    // Colar o MLB da Premium mostra o produto já aberto, com a Premium dentro.
    type(searchInput(container), "mlb11");
    await waitFor(() => assert.match(options(container).join(" | "), /MLB11/));
  });
});
