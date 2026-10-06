import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { act, renderIntoDocument } from "@/test-setup/render";
import { HomeAttentionZone } from "@/components/home/dashboard/HomeAttentionZone";
import { HomeDashboardProvider } from "@/components/home/dashboard/HomeDashboardProvider";
import { createMemoryDashboardPreferences } from "@/lib/home/dashboard/dashboard-preferences-repository";
import { coreSnapshot, flush } from "./home-dashboard-fixtures";
import type { HomeCoreSnapshot } from "@/lib/home/dashboard/home-core-types";

function basePendings(
  overrides: Partial<NonNullable<HomeCoreSnapshot["pendings"]>> = {},
): NonNullable<HomeCoreSnapshot["pendings"]> {
  return {
    failedInventoryRuns: 0,
    pendingDreImports: 0,
    pendingDreImportMonths: [],
    dreMonths: [],
    closedInventoryMonths: [],
    year: 2026,
    ...overrides,
  };
}

function withPendingMonths(count: number) {
  // Um de 2025 e o resto de 2026: é o caso que obriga o rótulo a levar o ano.
  const months = [
    { year: 2025, month: 12 },
    ...Array.from({ length: count - 1 }, (_, i) => ({
      year: 2026,
      month: i + 1,
    })),
  ];
  return basePendings({
    pendingDreImportMonths: months,
    pendingDreImports: months.length,
  });
}

async function renderZone(core: HomeCoreSnapshot) {
  mock.method(globalThis, "fetch", async () =>
    Response.json({ resolvedAt: new Date().toISOString(), data: {} }),
  );
  const view = renderIntoDocument(
    <HomeDashboardProvider
      core={core}
      repository={createMemoryDashboardPreferences()}
    >
      <HomeAttentionZone />
    </HomeDashboardProvider>,
  );
  await act(async () => {
    await flush();
  });
  return view;
}

function pillFor(container: HTMLElement, text: RegExp): HTMLElement | null {
  return (
    [...container.querySelectorAll("a")].find((a) =>
      text.test(a.textContent ?? ""),
    ) ?? null
  );
}

describe("HomeAttentionZone", () => {
  afterEach(() => mock.restoreAll());

  it("nomeia os meses da pendência no pill", async () => {
    // Era o problema: «3 conciliações de DRE pendentes» sem dizer onde agir.
    const { container, unmount } = await renderZone(
      coreSnapshot({ pendings: withPendingMonths(3) }),
    );

    const pill = pillFor(container, /conciliações de DRE pendentes/);
    assert.ok(pill, "o pill precisa existir");
    // O espaço entre contagem e rótulo é `gap` do flex, não texto: em
    // `textContent` eles ficam colados. O nome acessível é onde a frase existe
    // de verdade.
    assert.match(pill.getAttribute("aria-label") ?? "", /^3 conciliações de DRE pendentes:/);

    const visible = pill.textContent ?? "";
    assert.match(visible, /dez\.\/2025/, "mês de outro ano leva o ano");
    assert.match(visible, /jan\./);
    unmount();
  });

  it("corta em +N no visível e guarda a lista inteira no título", async () => {
    const { container, unmount } = await renderZone(
      coreSnapshot({ pendings: withPendingMonths(7) }),
    );

    const pill = pillFor(container, /conciliações de DRE pendentes/);
    assert.ok(pill, "o pill precisa existir");
    assert.match(pill.textContent ?? "", /\+4/, "o visível é cortado");

    // Sem isto, cortar o visível perderia a informação de vez — ninguém
    // descobriria os outros 4 meses.
    const title = pill.getAttribute("title") ?? "";
    assert.match(title, /dez\.\/2025/);
    assert.match(title, /jun\./, "o título tem o último mês da lista");
    assert.ok(!title.includes("+4"), "o título não é cortado");

    // `aria-label` substitui o texto visível, então repete contagem e rótulo.
    const label = pill.getAttribute("aria-label") ?? "";
    assert.match(label, /7 conciliações de DRE pendentes/);
    assert.match(label, /jun\./);
    unmount();
  });

  it("pill sem detalhe não ganha aria-label", async () => {
    // Definir `aria-label` nos outros sinais mudaria o nome acessível deles sem
    // motivo nenhum.
    const { container, unmount } = await renderZone(
      coreSnapshot({
        pendings: basePendings({ failedInventoryRuns: 2 }),
      }),
    );

    const pill = pillFor(container, /fechamentos de estoque/);
    assert.ok(pill);
    assert.equal(pill.getAttribute("aria-label"), null);
    assert.equal(pill.getAttribute("title"), null);
    unmount();
  });

  it("um pill por sinal, cada um numa única linha", async () => {
    // O detalhe é um span dentro do pill; se virar outro item de lista ou outra
    // linha, a zona deixa de ser a faixa compacta que justifica a existência dela.
    const { container, unmount } = await renderZone(
      coreSnapshot({
        pendings: withPendingMonths(3),
      }),
    );

    const items = container.querySelectorAll("li");
    const links = container.querySelectorAll("a");
    assert.equal(items.length, links.length);
    for (const link of links) {
      assert.ok(
        !link.className.includes("flex-wrap"),
        "o pill não pode quebrar linha",
      );
    }
    unmount();
  });

  it("leva pro ano certo quando a pendência é toda de outro ano", async () => {
    const { container, unmount } = await renderZone(
      coreSnapshot({
        pendings: basePendings({
          pendingDreImportMonths: [{ year: 2025, month: 12 }],
          pendingDreImports: 1,
        }),
      }),
    );

    const pill = pillFor(container, /conciliação de DRE pendente/);
    assert.equal(pill?.getAttribute("href"), "/dashboard/dre?ano=2025");
    unmount();
  });
});
