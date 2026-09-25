import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { act, renderIntoDocument } from "@/test-setup/render";
import { HomeDashboardProvider } from "@/components/home/dashboard/HomeDashboardProvider";
import { HomeWidgetGrid } from "@/components/home/dashboard/HomeWidgetGrid";
import { createMemoryDashboardPreferences } from "@/lib/home/dashboard/dashboard-preferences-repository";
import {
  buildDefaultDashboardPreferences,
  reorderWidgets,
  setWidgetVisible,
  visibleWidgetIds,
} from "@/lib/home/dashboard/dashboard-preferences";
import { HOME_WIDGET_DEFINITIONS } from "@/lib/home/dashboard/widget-registry";
import { hasHomeWidgetRenderer } from "@/components/home/dashboard/HomeWidgetRenderer";
import {
  coreSnapshot,
  flush,
  installImmediateIntersectionObserver,
} from "./home-dashboard-fixtures";
import type { HomeCoreSnapshot } from "@/lib/home/dashboard/home-core-types";
import type { HomeFinanceSlice } from "@/lib/home/dashboard/widget-data-keys";
import type { DashboardPreferences } from "@/lib/home/dashboard/dashboard-preferences";

function financeSlice(): HomeFinanceSlice {
  return {
    year: 2026,
    latestMonth: 8,
    latestMonthLabel: "Agosto",
    latestSyncedAt: "2026-09-01T00:00:00.000Z",
    totalEntrada: 42580,
    margemContribuicao: 12000,
    margemContribuicaoPercent: 28.2,
    lucroOperacional: 5400,
    lucroOperacionalPercent: 12.7,
    resultadoLiquido: 5000,
    resultadoLiquidoSeries: Array.from({ length: 12 }, (_, i) =>
      i < 8 ? 1000 * (i + 1) : null,
    ),
    margemPercentSeries: Array(12).fill(null),
    monthsSyncedCount: 8,
    syncWarningCount: 0,
  };
}

function batchUrls(calls: { arguments: unknown[] }[]): string[] {
  return calls
    .map((call) => String(call.arguments[0]))
    .filter((url) => url.includes("/api/dashboard/widgets?"));
}

async function renderGrid(options: {
  core?: HomeCoreSnapshot;
  preferences?: DashboardPreferences;
  respond?: (url: string) => Response;
} = {}) {
  const respond =
    options.respond ??
    ((url: string) => {
      if (url.includes("/promotions")) {
        return Response.json({
          expiringSoon: [],
          withoutPromotionCount: 0,
          totalActiveItems: 0,
          fetchedAt: new Date().toISOString(),
          expiringSoonDays: 3,
          warnings: [],
        });
      }
      if (url.includes("/widgets/pma")) return Response.json({ rows: [] });
      return Response.json({
        resolvedAt: new Date().toISOString(),
        data: { finance: { ok: true, value: financeSlice() } },
      });
    });

  const fetchMock = mock.method(
    globalThis,
    "fetch",
    async (input: unknown) => respond(String(input)),
  );

  const repository = createMemoryDashboardPreferences(options.preferences);
  const view = renderIntoDocument(
    <HomeDashboardProvider
      core={options.core ?? coreSnapshot()}
      repository={repository}
    >
      <HomeWidgetGrid />
    </HomeDashboardProvider>,
  );

  await act(async () => {
    await flush();
  });

  return { ...view, fetchMock, repository };
}

describe("HomeWidgetGrid", () => {
  let restoreObserver: () => void;

  beforeEach(() => {
    restoreObserver = installImmediateIntersectionObserver();
  });

  afterEach(() => {
    restoreObserver();
    mock.restoreAll();
    globalThis.localStorage?.clear?.();
  });

  it("tem um componente para todo widget do registry", () => {
    // Impede o caso "registrei o widget e esqueci o componente", que
    // renderizaria um buraco na grade sem erro nenhum.
    for (const definition of HOME_WIDGET_DEFINITIONS) {
      assert.ok(
        hasHomeWidgetRenderer(definition.id),
        `widget "${definition.id}" não tem componente no HomeWidgetRenderer`,
      );
    }
  });

  it("renderiza os widgets visíveis do layout default", async () => {
    const { container, unmount } = await renderGrid();
    const text = container.textContent ?? "";

    assert.match(text, /Compras/);
    assert.match(text, /Full/);
    assert.match(text, /Saúde do catálogo/);
    assert.match(text, /Catálogo perdendo/);
    assert.match(text, /Abaixo do PMA/);

    for (const definition of HOME_WIDGET_DEFINITIONS) {
      if (definition.defaultVisible) continue;
      // widget de batch escondido não pode nem estar no DOM
      if (definition.source.kind !== "batch") continue;
      assert.equal(
        container.querySelector(`[data-widget-id="${definition.id}"]`),
        null,
        `${definition.id} está escondido e não deveria ser renderizado`,
      );
    }
    unmount();
  });

  it("pede só as chaves dos widgets visíveis, num único request", async () => {
    const { fetchMock, unmount } = await renderGrid();
    const urls = batchUrls(fetchMock.mock.calls);

    assert.equal(urls.length, 1, "um request de batch, não mais");
    // `dre-resultado` (finance) é o único widget de batch, e nasce visível.
    assert.match(urls[0], /keys=finance/);
    assert.equal(urls[0].includes("keys=finance"), true);
    unmount();
  });

  it("não faz nenhum request de batch quando nenhum widget de batch está visível", async () => {
    let prefs = buildDefaultDashboardPreferences();
    prefs = setWidgetVisible(prefs, "dre-resultado", false);

    const { fetchMock, unmount } = await renderGrid({ preferences: prefs });
    assert.deepEqual(batchUrls(fetchMock.mock.calls), []);
    unmount();
  });

  it("não repete request quando a grade re-renderiza", async () => {
    const { fetchMock, repository, unmount } = await renderGrid();
    const before = batchUrls(fetchMock.mock.calls).length;
    assert.equal(before, 1);

    // qualquer escrita de preferência re-renderiza a grade inteira
    await act(async () => {
      repository.write(repository.read());
      await flush();
    });

    assert.equal(
      batchUrls(fetchMock.mock.calls).length,
      before,
      "re-render não pode refazer o request",
    );
    unmount();
  });

  it("esconder e reexibir um widget de batch não dispara request novo", async () => {
    const { fetchMock, repository, unmount } = await renderGrid();
    const before = batchUrls(fetchMock.mock.calls).length;

    await act(async () => {
      repository.write(
        setWidgetVisible(repository.read(), "dre-resultado", false),
      );
      await flush();
    });
    await act(async () => {
      repository.write(
        setWidgetVisible(repository.read(), "dre-resultado", true),
      );
      await flush();
    });

    assert.equal(
      batchUrls(fetchMock.mock.calls).length,
      before,
      "o resultado já resolvido fica no acumulador",
    );
    unmount();
  });

  it("reordenar preserva o estado interno do widget e não refaz request", async () => {
    // A regressão que o desenho inteiro existe para evitar: se reordenar
    // desmontasse os widgets, uma nota meio digitada seria perdida e todo
    // fetch seria repetido.
    const { container, fetchMock, repository, unmount } = await renderGrid();

    const textarea = container.querySelector("textarea");
    assert.ok(textarea, "o card de notas rápidas precisa estar na grade");
    await act(async () => {
      textarea.value = "rascunho que não pode sumir";
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      await flush(1);
    });

    const requestsBefore = fetchMock.mock.calls.length;
    const order = visibleWidgetIds(repository.read());
    const notesIndex = order.indexOf("notas");
    assert.ok(notesIndex > 0);
    const reordered = [...order];
    [reordered[notesIndex - 1], reordered[notesIndex]] = [
      reordered[notesIndex],
      reordered[notesIndex - 1],
    ];

    await act(async () => {
      repository.write(reorderWidgets(repository.read(), reordered));
      await flush();
    });

    const after = container.querySelector("textarea");
    assert.equal(
      after?.value,
      "rascunho que não pode sumir",
      "reordenar não pode remontar o widget",
    );
    assert.equal(
      fetchMock.mock.calls.length,
      requestsBefore,
      "reordenar não pode disparar fetch",
    );
    unmount();
  });

  it("uma slice que falhou degrada só o card dela", async () => {
    const { container, unmount } = await renderGrid({
      respond: (url) => {
        if (url.includes("/api/dashboard/widgets?")) {
          return Response.json({
            resolvedAt: new Date().toISOString(),
            data: { finance: { ok: false, error: "finance_failed" } },
          });
        }
        if (url.includes("/widgets/pma")) return Response.json({ rows: [] });
        return Response.json({
          expiringSoon: [],
          withoutPromotionCount: 0,
          totalActiveItems: 0,
          fetchedAt: new Date().toISOString(),
          expiringSoonDays: 3,
          warnings: [],
        });
      },
    });

    const text = container.textContent ?? "";
    assert.match(text, /Resultado do mês/, "o card continua na tela");
    assert.match(text, /finance_failed/, "com o erro dentro dele");
    // e o resto da Home segue de pé
    assert.match(text, /Compras/);
    assert.match(text, /Catálogo perdendo/);
    unmount();
  });

  it("entrar em modo de edição não revela nem busca widget escondido", async () => {
    // Regressão: revelar os escondidos em modo de edição fazia PMA/promoções
    // dispararem o fetch deles justamente por estarem escondidos.
    let prefs = buildDefaultDashboardPreferences();
    prefs = setWidgetVisible(prefs, "promocoes", false);
    prefs = setWidgetVisible(prefs, "dre-resultado", false);

    const { container, fetchMock, repository, unmount } = await renderGrid({
      preferences: prefs,
    });
    const before = fetchMock.mock.calls.length;

    await act(async () => {
      repository.write(repository.read());
      await flush();
    });

    assert.equal(
      container.querySelector('[data-widget-id="promocoes"]'),
      null,
      "widget escondido continua fora do DOM",
    );
    assert.equal(fetchMock.mock.calls.length, before);
    unmount();
  });

  it("roda no caminho de produção (localStorage) sem aviso de React", async () => {
    // Os outros testes injetam o repositório de memória, cuja identidade é
    // estável por construção — e foi exatamente por isso que eles não pegaram o
    // `getSnapshot` sem cache do repositório de `localStorage`, que é o caminho
    // real. Aqui o provider monta o repositório dele, como em produção, e
    // qualquer "getSnapshot should be cached" / "Maximum update depth" derruba
    // o teste.
    const logged: string[] = [];
    const consoleError = mock.method(console, "error", (...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    });
    const consoleWarn = mock.method(console, "warn", (...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    });
    mock.method(globalThis, "fetch", async () =>
      Response.json({
        resolvedAt: new Date().toISOString(),
        data: { finance: { ok: true, value: financeSlice() } },
      }),
    );

    // Sem prop `repository`: o provider usa createLocalStorageDashboardPreferences.
    const view = renderIntoDocument(
      <HomeDashboardProvider core={coreSnapshot()}>
        <HomeWidgetGrid />
      </HomeDashboardProvider>,
    );
    await act(async () => {
      await flush();
    });
    view.rerender(
      <HomeDashboardProvider core={coreSnapshot()}>
        <HomeWidgetGrid />
      </HomeDashboardProvider>,
    );
    await act(async () => {
      await flush();
    });

    const offenders = logged.filter((line) =>
      /getSnapshot|Maximum update depth|infinite loop/i.test(line),
    );
    assert.deepEqual(offenders, [], `React reclamou:\n${offenders.join("\n")}`);
    assert.match(view.container.textContent ?? "", /Compras/);

    consoleError.mock.restore();
    consoleWarn.mock.restore();
    view.unmount();
  });

  it("a zona de atenção colapsa numa linha quando não há nada pendente", async () => {
    const { container, unmount } = await renderGrid();
    const text = container.textContent ?? "";
    assert.match(text, /Tudo em ordem por aqui/);
    assert.doesNotMatch(text, /Precisa da sua atenção/);
    unmount();
  });

  it("a zona de atenção lista os sinais, do mais grave para o menos", async () => {
    const { container, unmount } = await renderGrid({
      core: coreSnapshot({
        catalogLosing: [
          {
            mlItemId: "MLB1",
            sku: "SKU1",
            title: "Item",
            imageUrl: null,
            sellerPrice: 100,
            priceToWin: 90,
            gap: 10,
          },
        ],
        pendings: {
          failedInventoryRuns: 1,
          pendingDreImports: 0,
          dreMonths: [],
          closedInventoryMonths: [],
        },
      }),
    });

    const text = container.textContent ?? "";
    assert.match(text, /Precisa da sua atenção/);
    assert.match(text, /fechamento de estoque falhou/);
    assert.match(text, /anúncio perdendo o catálogo/);
    assert.ok(
      text.indexOf("fechamento de estoque falhou") <
        text.indexOf("anúncio perdendo o catálogo"),
      "o sinal mais grave vem primeiro",
    );
    unmount();
  });
});
