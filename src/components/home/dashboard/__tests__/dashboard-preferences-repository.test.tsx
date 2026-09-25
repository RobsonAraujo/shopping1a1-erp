import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  createLocalStorageDashboardPreferences,
  createMemoryDashboardPreferences,
} from "@/lib/home/dashboard/dashboard-preferences-repository";
import {
  DASHBOARD_PREFERENCES_STORAGE_KEY,
  buildDefaultDashboardPreferences,
  setWidgetVisible,
} from "@/lib/home/dashboard/dashboard-preferences";
import { getActiveView } from "@/lib/home/dashboard/dashboard-preferences";

/**
 * Teste no conjunto DOM (não no puro) porque o repositório de `localStorage`
 * só funciona com `localStorage` de verdade — e é justamente o comportamento
 * de identidade dele que importa aqui.
 */
describe("createLocalStorageDashboardPreferences", () => {
  afterEach(() => {
    globalThis.localStorage?.clear?.();
  });

  it("devolve o MESMO objeto enquanto nada muda", () => {
    // `read()` é o `getSnapshot` do `useSyncExternalStore`, que exige
    // identidade estável. Normalizar a cada chamada devolvia objeto novo em
    // todo render e o React avisava "The result of getSnapshot should be cached
    // to avoid an infinite loop" — depois entrava em laço de render.
    const repo = createLocalStorageDashboardPreferences();
    const first = repo.read();
    const second = repo.read();
    const third = repo.read();

    assert.equal(first, second, "duas leituras seguidas, mesmo objeto");
    assert.equal(second, third);
  });

  it("mantém a identidade estável também com valor já gravado", () => {
    const repo = createLocalStorageDashboardPreferences();
    repo.write(setWidgetVisible(buildDefaultDashboardPreferences(), "notas", false));

    const first = repo.read();
    const second = repo.read();
    assert.equal(first, second);
    assert.equal(
      getActiveView(first).widgets.find((w) => w.id === "notas")?.visible,
      false,
    );
  });

  it("devolve objeto novo quando o conteúdo muda de verdade", () => {
    const repo = createLocalStorageDashboardPreferences();
    const before = repo.read();

    repo.write(setWidgetVisible(before, "notas", false));
    const after = repo.read();

    assert.notEqual(before, after, "escrita real precisa mudar o snapshot");
    assert.equal(after, repo.read(), "e o novo valor volta a ser estável");
  });

  it("sobrevive a storage corrompido sem lançar", () => {
    globalThis.localStorage.setItem(DASHBOARD_PREFERENCES_STORAGE_KEY, "{");
    const repo = createLocalStorageDashboardPreferences();
    assert.deepEqual(repo.read(), buildDefaultDashboardPreferences());
    assert.equal(repo.read(), repo.read(), "e segue estável");
  });

  it("notifica quem assinou quando grava", () => {
    const repo = createLocalStorageDashboardPreferences();
    let notified = 0;
    const unsubscribe = repo.subscribe(() => {
      notified += 1;
    });
    repo.write(setWidgetVisible(repo.read(), "notas", false));
    assert.ok(notified > 0);
    unsubscribe();
  });
});

describe("createMemoryDashboardPreferences", () => {
  it("também é estável entre leituras", () => {
    const repo = createMemoryDashboardPreferences();
    assert.equal(repo.read(), repo.read());
  });

  it("normaliza a entrada inicial inválida", () => {
    const repo = createMemoryDashboardPreferences("{");
    assert.deepEqual(repo.read(), buildDefaultDashboardPreferences());
  });
});
