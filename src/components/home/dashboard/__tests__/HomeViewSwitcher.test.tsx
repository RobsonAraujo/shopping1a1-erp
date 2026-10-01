import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { act, renderIntoDocument } from "@/test-setup/render";
import { HomeDashboardProvider } from "@/components/home/dashboard/HomeDashboardProvider";
import { HomeViewSwitcher } from "@/components/home/dashboard/HomeViewSwitcher";
import { createMemoryDashboardPreferences } from "@/lib/home/dashboard/dashboard-preferences-repository";
import {
  buildDefaultDashboardPreferences,
  createView,
  renameView,
} from "@/lib/home/dashboard/dashboard-preferences";
import { coreSnapshot, flush } from "./home-dashboard-fixtures";

/** Duas versões: «Robson» (principal) e «Jhonattan». */
function twoViews() {
  let prefs = buildDefaultDashboardPreferences();
  prefs = renameView(prefs, prefs.views[0].id, "Robson");
  const created = createView(prefs, { name: "Jhonattan" });
  return created.preferences;
}

async function renderSwitcher() {
  mock.method(globalThis, "fetch", async () =>
    Response.json({ resolvedAt: new Date().toISOString(), data: {} }),
  );
  const repository = createMemoryDashboardPreferences(twoViews());
  const view = renderIntoDocument(
    <HomeDashboardProvider core={coreSnapshot()} repository={repository}>
      <HomeViewSwitcher />
    </HomeDashboardProvider>,
  );
  await act(async () => {
    await flush();
  });
  return { ...view, repository };
}

function pill(label: string): HTMLElement | null {
  return document.querySelector(`[aria-label="${label}"]`);
}

describe("HomeViewSwitcher", () => {
  afterEach(() => mock.restoreAll());

  it("mostra uma pill por versão, com a principal marcada", async () => {
    // Era um dropdown: pra saber quais versões existiam você tinha que abrir.
    const { container, unmount } = await renderSwitcher();

    const text = container.textContent ?? "";
    assert.match(text, /Robson/);
    assert.match(text, /Jhonattan/);
    // A estrela fica na pill, não escondida no menu: qual versão abre ao
    // recarregar é o que mais confunde nesta feature.
    assert.ok(pill("principal"), "a principal precisa estar marcada à vista");
    unmount();
  });

  it("a versão ativa é a principal no primeiro render", async () => {
    const { unmount } = await renderSwitcher();
    const active = document.querySelector('[aria-current="true"]');
    assert.match(active?.textContent ?? "", /Robson/);
    unmount();
  });

  it("clicar numa pill troca a versão ativa", async () => {
    const { unmount } = await renderSwitcher();

    const other = pill("Abrir versão Jhonattan");
    assert.ok(other, "a versão inativa é um botão de trocar");
    await act(async () => {
      (other as HTMLButtonElement).click();
      await flush();
    });

    const active = document.querySelector('[aria-current="true"]');
    assert.match(active?.textContent ?? "", /Jhonattan/);
    assert.equal(
      pill("Abrir versão Jhonattan"),
      null,
      "a pill ativa deixa de ser botão de trocar e passa a abrir as ações",
    );
    assert.ok(pill("Ações da versão Jhonattan"));
    unmount();
  });

  it("trocar de versão não mexe em qual delas é a principal", async () => {
    // Visitar é temporário: a principal (o que abre ao recarregar) só muda por
    // ação explícita no menu.
    const { repository, unmount } = await renderSwitcher();
    const before = repository.read().defaultViewId;

    await act(async () => {
      (pill("Abrir versão Jhonattan") as HTMLButtonElement).click();
      await flush();
    });

    assert.equal(repository.read().defaultViewId, before);
    unmount();
  });
});
