import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { act, renderIntoDocument } from "@/test-setup/render";
import { HomeCustomizeSheet } from "@/components/home/dashboard/HomeCustomizeSheet";
import { HomeDashboardProvider } from "@/components/home/dashboard/HomeDashboardProvider";
import { createMemoryDashboardPreferences } from "@/lib/home/dashboard/dashboard-preferences-repository";
import {
  buildDefaultDashboardPreferences,
  getActiveView,
} from "@/lib/home/dashboard/dashboard-preferences";
import { HOME_WIDGET_DEFINITIONS } from "@/lib/home/dashboard/widget-registry";
import { coreSnapshot, flush } from "./home-dashboard-fixtures";

async function renderSheet() {
  mock.method(globalThis, "fetch", async () =>
    Response.json({ resolvedAt: new Date().toISOString(), data: {} }),
  );
  const repository = createMemoryDashboardPreferences();
  const view = renderIntoDocument(
    <HomeDashboardProvider core={coreSnapshot()} repository={repository}>
      <HomeCustomizeSheet open onOpenChange={() => {}} />
    </HomeDashboardProvider>,
  );
  await act(async () => {
    await flush();
  });
  return { ...view, repository };
}

/** O sheet renderiza num portal, então as buscas são no document. */
function byLabel(label: string): HTMLElement | null {
  return document.querySelector(`[aria-label="${label}"]`);
}

function click(element: Element | null) {
  assert.ok(element, "elemento não encontrado");
  return act(() => {
    (element as HTMLElement).click();
  });
}

describe("HomeCustomizeSheet", () => {
  afterEach(() => {
    mock.restoreAll();
    document.body.innerHTML = "";
    globalThis.localStorage?.clear?.();
  });

  it("lista todo widget do registry com título e descrição", async () => {
    const { unmount } = await renderSheet();
    const text = document.body.textContent ?? "";
    for (const definition of HOME_WIDGET_DEFINITIONS) {
      assert.match(
        text,
        new RegExp(definition.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        `"${definition.title}" não aparece no sheet`,
      );
    }
    assert.match(text, /Personalizar início/);
    unmount();
  });

  it("o switch de visibilidade persiste no repositório", async () => {
    const { repository, unmount } = await renderSheet();
    const before = getActiveView(repository.read()).widgets.find(
      (w) => w.id === "produtos-saude",
    );
    assert.equal(before?.visible, true);

    await click(byLabel("Mostrar Saúde do catálogo"));

    const after = getActiveView(repository.read()).widgets.find(
      (w) => w.id === "produtos-saude",
    );
    assert.equal(after?.visible, false);
    unmount();
  });

  it("widget fixado tem o switch desabilitado", async () => {
    const { unmount } = await renderSheet();
    const pinned = HOME_WIDGET_DEFINITIONS.filter((d) => d.pinned);
    assert.ok(pinned.length > 0);
    for (const definition of pinned) {
      const toggle = byLabel(`Mostrar ${definition.title}`);
      assert.ok(toggle, `${definition.id}: switch não encontrado`);
      assert.equal(
        toggle.getAttribute("disabled") !== null ||
          toggle.getAttribute("data-disabled") !== null,
        true,
        `${definition.id}: switch de widget fixado precisa estar desabilitado`,
      );
      // e sem botões de mover: fixado não sai do topo
      assert.equal(byLabel(`Mover ${definition.title} para cima`), null);
    }
    unmount();
  });

  it("os botões de mover ficam desabilitados nos extremos da categoria", async () => {
    const { unmount } = await renderSheet();
    // "Vendas" é o primeiro de Operação; "Atalhos" é o último
    const firstUp = byLabel("Mover Vendas para cima") as HTMLButtonElement | null;
    const lastDown = byLabel("Mover Atalhos para baixo") as HTMLButtonElement | null;
    assert.ok(firstUp);
    assert.ok(lastDown);
    assert.equal(firstUp.disabled, true);
    assert.equal(lastDown.disabled, true);
    unmount();
  });

  it("mover para baixo troca a ordem e persiste", async () => {
    const { repository, unmount } = await renderSheet();
    const order = () =>
      getActiveView(repository.read())
        .widgets.map((w) => w.id)
        .filter((id) => id === "kpi-compras" || id === "kpi-vendas");

    assert.deepEqual(order(), ["kpi-vendas", "kpi-compras"]);
    await click(byLabel("Mover Vendas para baixo"));
    assert.deepEqual(order(), ["kpi-compras", "kpi-vendas"]);
    unmount();
  });

  it("só mostra seletor de tamanho para widget com mais de um tamanho", async () => {
    const { unmount } = await renderSheet();
    const multi = HOME_WIDGET_DEFINITIONS.find(
      (d) => d.supportedSizes.length > 1,
    );
    const single = HOME_WIDGET_DEFINITIONS.find(
      (d) => d.supportedSizes.length === 1,
    );
    assert.ok(multi && single);
    assert.ok(
      document.getElementById(`size-${multi.id}`),
      `${multi.id} tem vários tamanhos e precisa do seletor`,
    );
    assert.equal(
      document.getElementById(`size-${single.id}`),
      null,
      `${single.id} tem um tamanho só e não pode mostrar seletor`,
    );
    unmount();
  });

  it("restaurar padrão volta exatamente ao layout inicial", async () => {
    const { repository, unmount } = await renderSheet();

    await click(byLabel("Mostrar Saúde do catálogo"));
    await click(byLabel("Mover Vendas para baixo"));
    assert.notDeepEqual(repository.read(), buildDefaultDashboardPreferences());

    const resetTrigger = [...document.querySelectorAll("button")].find((b) =>
      (b.textContent ?? "").includes("Restaurar padrão"),
    );
    await click(resetTrigger ?? null);
    await act(async () => {
      await flush();
    });

    const confirm = [...document.querySelectorAll("button")].find(
      (b) => (b.textContent ?? "").trim() === "Restaurar",
    );
    await click(confirm ?? null);

    assert.deepEqual(repository.read(), buildDefaultDashboardPreferences());
    unmount();
  });
});
