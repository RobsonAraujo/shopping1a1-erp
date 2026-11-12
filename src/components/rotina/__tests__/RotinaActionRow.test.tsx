import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { act, renderIntoDocument, waitFor } from "@/test-setup/render";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  RotinaActionRow,
  type RotinaActionHandlers,
} from "@/components/rotina/RotinaActionRow";
import { buildRotinaView } from "@/lib/rotina/view";
import {
  NOW,
  TZ,
  catalogLive,
  listing,
  settings,
} from "@/lib/rotina/__tests__/fixtures";

function viewWith(health: Parameters<typeof listing>[0][], live = [] as ReturnType<typeof catalogLive>[]) {
  return buildRotinaView({
    now: NOW,
    timeZone: TZ,
    settings: settings(),
    health: health.map((overrides) => listing(overrides)),
    catalogLive: live,
    targets: new Map(),
    states: [],
    lastRun: null,
    lastCompleteRunAt: "2026-11-10T09:00:00.000Z",
  });
}

function handlers(overrides: Partial<RotinaActionHandlers> = {}): RotinaActionHandlers {
  return {
    busy: false,
    onDone: () => {},
    onSnooze: () => {},
    onDismiss: () => {},
    onRecalculate: () => {},
    onSaveTarget: async () => true,
    ...overrides,
  };
}

function render(action: ReturnType<typeof viewWith>["actions"][number], h = handlers()) {
  return renderIntoDocument(
    <TooltipProvider>
      <ul>
        <RotinaActionRow action={action} handlers={h} timeZone={TZ} />
      </ul>
    </TooltipProvider>,
  );
}

/** `Intl` usa espaço não separável depois do "R$". */
function text(container: HTMLElement): string {
  return (container.textContent ?? "").replace(/ /g, " ");
}

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
  mock.restoreAll();
});

describe("RotinaActionRow", () => {
  it("shows the floor, both minimums and the max promo discount", () => {
    const view = viewWith([
      {
        mlItemId: "OWN1",
        imageUrl: null,
        hasPromotion: false,
        regularPrice: null,
        salePrice: 129.9,
        floorAfterAdsPrice: 104.5,
        floorMcPrice: 99.8,
      },
    ]);
    const action = view.actions.find((candidate) => candidate.rule === "promo_missing")!;
    const rendered = render(action);
    cleanup = rendered.unmount;
    const content = text(rendered.container);

    assert.match(content, /Sem promoção ativa/);
    assert.match(content, /Mínimo p\/ 2%:\s*R\$ 104,50/);
    assert.match(content, /Após ADS R\$ 104,50 · MC R\$ 99,80/);
    assert.match(content, /desconto máx\.\s*19%/);
  });

  it("warns about the price band where shipping makes the margin fall", () => {
    const view = viewWith([
      {
        mlItemId: "OWN2",
        imageUrl: null,
        hasPromotion: false,
        regularPrice: 99,
        salePrice: 99,
        floorAfterAdsPrice: 54.8,
        floorMcPrice: 52.1,
        floorBands: [{ from: 79, to: 82.19 }],
      },
    ]);
    const action = view.actions.find((candidate) => candidate.rule === "promo_missing")!;
    const rendered = render(action);
    cleanup = rendered.unmount;
    assert.match(text(rendered.container), /Evite R\$ 79,00 a R\$ 82,19/);
  });

  it("shows the catalog verdict and marks the action done", () => {
    const view = viewWith(
      [
        {
          mlItemId: "CAT1",
          imageUrl: null,
          catalogListing: true,
          floorAfterAdsPrice: 91.2,
          floorMcPrice: 88.7,
        },
      ],
      [catalogLive({ mlItemId: "CAT1", priceToWin: 94.9 })],
    );
    const action = view.actions.find((candidate) => candidate.rule === "catalog_losing")!;
    const onDone = mock.fn();
    const rendered = render(action, handlers({ onDone }));
    cleanup = rendered.unmount;

    const content = text(rendered.container);
    assert.match(content, /Perdendo no catálogo desde hoje às 10h05/);
    assert.match(content, /Dá para ganhar mantendo a margem mínima: sobra R\$ 3,70/);
    assert.match(content, /Novo/);

    const doneButton = [...rendered.container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Feito"),
    );
    assert.ok(doneButton);
    act(() => {
      doneButton.click();
    });
    assert.equal(onDone.mock.callCount(), 1);
  });

  it("opens the ML screen where the task gets done and shows PMA and TACOS", () => {
    const view = viewWith(
      [
        {
          mlItemId: "CAT1",
          imageUrl: null,
          catalogListing: true,
          catalogProductId: "MLB27951053",
          floorAfterAdsPrice: 91.2,
          floorMcPrice: 88.7,
          pmaPrice: 89.9,
          tacosPercent: 5.2,
          adsStatus: "active",
        },
      ],
      [catalogLive({ mlItemId: "CAT1", priceToWin: 94.9 })],
    );
    const action = view.actions.find((candidate) => candidate.rule === "catalog_losing")!;
    const rendered = render(action);
    cleanup = rendered.unmount;

    const links = Object.fromEntries(
      [...rendered.container.querySelectorAll("a")].map((link) => [
        link.textContent?.trim(),
        link.getAttribute("href"),
      ]),
    );
    assert.equal(
      links["Editar preço"],
      "https://www.mercadolivre.com.br/syi/core/modify?itemId=CAT1",
    );
    assert.equal(links["Ver concorrência"], "https://www.mercadolivre.com.br/p/MLB27951053/s");
    assert.equal(links["Abrir no ML"], undefined, "o botão genérico deu lugar ao da tarefa");

    const content = text(rendered.container);
    assert.match(content, /PMA\s*R\$ 89,90/);
    // Meta de TACOS do fixture: 10%.
    assert.match(content, /TACOS 7d\s*5,2%\s*· meta 10%/);
  });

  it("marks losing catalog in red and simulates the price to win", async () => {
    const view = viewWith(
      [
        {
          mlItemId: "CAT1",
          imageUrl: null,
          catalogListing: true,
          floorAfterAdsPrice: 91.2,
          floorMcPrice: 88.7,
        },
      ],
      [catalogLive({ mlItemId: "CAT1", priceToWin: 94.9 })],
    );
    const action = view.actions.find((candidate) => candidate.rule === "catalog_losing")!;
    const fetchMock = mock.method(globalThis, "fetch", async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { prices: number[] };
      return Response.json({
        mlItemId: "CAT1",
        targetPercent: 2,
        inputsFrom: "refresh",
        inputsAt: "2026-11-10T09:00:00.000Z",
        feeRebate: null,
        blocked: null,
        results: [
          {
            price: body.prices[0],
            quoted: true,
            mlFeeAmount: 11.39,
            shippingCost: 20,
            marginPercent: 6.2,
            marginValue: 5.88,
            marginAfterAdsPercent: 3.2,
            marginAfterAdsValue: 3.04,
            decidingBasis: "afterAds",
            meetsTarget: true,
            lines: [],
          },
        ],
      });
    });

    const rendered = render(action);
    cleanup = rendered.unmount;
    const row = rendered.container.querySelector("li")!;
    assert.match(row.className, /border-l-rose-500/);
    assert.match(text(rendered.container), /Perdendo/);

    const simulateButton = [...rendered.container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Simular a"),
    );
    assert.ok(simulateButton);
    assert.match(text(simulateButton), /Simular a R\$ 94,90/);
    await act(async () => {
      simulateButton.click();
    });
    await waitFor(() => {
      assert.match(text(rendered.container), /A R\$ 94,90:\s*Após ADS\s*3,2%/);
    });
    assert.match(text(rendered.container), /dentro do mínimo de 2%/);
    assert.equal(fetchMock.mock.callCount(), 1);
    const sent = JSON.parse(String(fetchMock.mock.calls[0].arguments[1]?.body));
    assert.deepEqual(sent, { mlItemId: "CAT1", prices: [94.9] });
  });
});
