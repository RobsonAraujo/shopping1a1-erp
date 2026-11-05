import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { createRoot } from "react-dom/client";
import { act } from "@/test-setup/render";
import { HomeDashboardProvider } from "@/components/home/dashboard/HomeDashboardProvider";
import { HomeWidgetRenderer } from "@/components/home/dashboard/HomeWidgetRenderer";
import { createMemoryDashboardPreferences } from "@/lib/home/dashboard/dashboard-preferences-repository";
import type { HomeCoreSnapshot } from "@/lib/home/dashboard/home-core-types";
import { coreSnapshot, flush } from "./home-dashboard-fixtures";

function deferredCore() {
  let resolve!: (core: HomeCoreSnapshot) => void;
  const promise = new Promise<HomeCoreSnapshot>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function mockFetch() {
  return mock.method(globalThis, "fetch", async () =>
    Response.json({ resolvedAt: new Date().toISOString(), data: {} }),
  );
}

function batchCalls(fetchMock: ReturnType<typeof mockFetch>) {
  return fetchMock.mock.calls.filter((call) =>
    String(call.arguments[0]).includes("/api/dashboard/widgets?"),
  ).length;
}

describe("Home com o snapshot chegando por stream", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  // `renderIntoDocument` usa `act` síncrono, e componente que suspende exige o
  // `act` aguardado: sem isso o React não processa a retomada depois do `resolve`.
  async function renderWidgets(core: Promise<HomeCoreSnapshot>, ids: string[]) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <HomeDashboardProvider
          core={core}
          repository={createMemoryDashboardPreferences()}
        >
          {ids.map((id) => (
            <HomeWidgetRenderer key={id} id={id} />
          ))}
        </HomeDashboardProvider>,
      );
      await flush();
    });
    return {
      container,
      unmount: async () => {
        await act(async () => {
          root.unmount();
        });
        container.remove();
      },
    };
  }

  // O React segura um skeleton recém-mostrado por 300 ms antes de trocá-lo.
  async function resolveCore(resolve: (core: HomeCoreSnapshot) => void) {
    await act(async () => {
      resolve(coreSnapshot());
      await flush();
      await new Promise((done) => setTimeout(done, 350));
    });
  }

  it("mostra o título na hora, com skeleton no corpo, até o snapshot chegar", async () => {
    mockFetch();
    const core = deferredCore();
    const { container, unmount } = await renderWidgets(core.promise, [
      "produtos-saude",
    ]);

    const section = container.querySelector('section[aria-label="Saúde do catálogo"]');
    assert.ok(section, "o card precisa existir antes do dado");
    assert.equal(section.getAttribute("aria-busy"), "true");
    assert.match(section.textContent ?? "", /Saúde do catálogo/);

    await resolveCore(core.resolve);

    const loaded = container.querySelector('section[aria-label="Saúde do catálogo"]');
    assert.equal(loaded?.getAttribute("aria-busy"), null);
    assert.match(loaded?.textContent ?? "", /42/);
    await unmount();
  });

  it("não deixa arrastar o card enquanto ele é skeleton", async () => {
    mockFetch();
    const core = deferredCore();
    const { container, unmount } = await renderWidgets(core.promise, [
      "produtos-saude",
    ]);

    assert.equal(container.querySelector("[data-home-drag-handle]"), null);
    await unmount();
  });

  it("só pede o batch depois que o snapshot chega, para não disputar o pool", async () => {
    const fetchMock = mockFetch();
    const core = deferredCore();
    const { unmount } = await renderWidgets(core.promise, ["produtos-saude"]);

    assert.equal(batchCalls(fetchMock), 0, "o batch não pode sair antes do snapshot");

    await resolveCore(core.resolve);

    assert.equal(batchCalls(fetchMock), 1, "o batch sai assim que o snapshot chega");
    await unmount();
  });

  it("não reserva faixa de onboarding enquanto o snapshot não chega", async () => {
    mockFetch();
    const core = deferredCore();
    const { container, unmount } = await renderWidgets(core.promise, [
      "onboarding",
    ]);

    assert.equal(container.querySelector(".animate-pulse"), null);
    await unmount();
  });

  it("mostra um placeholder na faixa de atenção", async () => {
    mockFetch();
    const core = deferredCore();
    const { container, unmount } = await renderWidgets(core.promise, ["atencao"]);

    assert.ok(container.querySelector(".animate-pulse"));

    await resolveCore(core.resolve);

    assert.equal(container.querySelector(".animate-pulse"), null);
    await unmount();
  });
});
