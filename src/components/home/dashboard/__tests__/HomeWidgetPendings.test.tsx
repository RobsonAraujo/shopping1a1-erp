import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { act, renderIntoDocument } from "@/test-setup/render";
import { HomeDashboardProvider } from "@/components/home/dashboard/HomeDashboardProvider";
import { HomeWidgetPendings } from "@/components/home/dashboard/widgets/HomeWidgetPendings";
import { createMemoryDashboardPreferences } from "@/lib/home/dashboard/dashboard-preferences-repository";
import { coreSnapshot, flush } from "./home-dashboard-fixtures";
import type { HomeCoreSnapshot } from "@/lib/home/dashboard/home-core-types";

function pendings(
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

async function renderWidget(core: HomeCoreSnapshot) {
  mock.method(globalThis, "fetch", async () =>
    Response.json({ resolvedAt: new Date().toISOString(), data: {} }),
  );
  const view = renderIntoDocument(
    <HomeDashboardProvider
      core={core}
      repository={createMemoryDashboardPreferences()}
    >
      <HomeWidgetPendings />
    </HomeDashboardProvider>,
  );
  await act(async () => {
    await flush();
  });
  return view;
}

describe("HomeWidgetPendings", () => {
  afterEach(() => mock.restoreAll());

  it("lista TODOS os meses da conciliação, sem cortar em +N", async () => {
    // O pill da zona de atenção corta; este card é a superfície onde se lê a
    // lista inteira. Se os dois cortassem, não sobraria lugar nenhum pra ver
    // todos os meses antes de ir pro DRE.
    const months = [
      { year: 2025, month: 12 },
      ...Array.from({ length: 6 }, (_, i) => ({ year: 2026, month: i + 1 })),
    ];
    const { container, unmount } = await renderWidget(
      coreSnapshot({
        pendings: pendings({
          pendingDreImportMonths: months,
          pendingDreImports: months.length,
        }),
      }),
    );

    const text = container.textContent ?? "";
    assert.match(text, /Esperando confirmação: dez\.\/2025, jan\./);
    assert.match(text, /e jun\./, "o último mês aparece");
    assert.ok(!text.includes("+"), "nada de corte neste card");
    unmount();
  });

  it("não produz ponto duplicado na frase", async () => {
    // Os rótulos de mês já terminam em ponto; concatenar outro daria "fev..".
    const { container, unmount } = await renderWidget(
      coreSnapshot({
        pendings: pendings({
          pendingDreImportMonths: [{ year: 2026, month: 2 }],
          pendingDreImports: 1,
        }),
      }),
    );

    const text = container.textContent ?? "";
    assert.match(text, /Esperando confirmação: fev\./);
    assert.ok(!text.includes(".."), text);
    unmount();
  });

  it("nos meses sem sincronizar, nomeia só os que faltam", async () => {
    const { container, unmount } = await renderWidget(
      coreSnapshot({
        pendings: pendings({
          dreMonths: [
            { year: 2026, month: 1, syncedAt: "2026-02-01T00:00:00.000Z" },
            { year: 2026, month: 2, syncedAt: null },
            { year: 2026, month: 3, syncedAt: null },
          ],
        }),
      }),
    );

    const text = container.textContent ?? "";
    assert.match(text, /2 meses de DRE sem sincronizar/);
    assert.match(text, /fev\. e mar\./);
    assert.ok(!text.includes("jan."), "o mês já sincronizado não entra");
    unmount();
  });

  it("sem pendência de conciliação, o card não inventa a linha", async () => {
    const { container, unmount } = await renderWidget(
      coreSnapshot({ pendings: pendings({ failedInventoryRuns: 1 }) }),
    );

    const text = container.textContent ?? "";
    assert.ok(!text.includes("Esperando confirmação"), text);
    assert.match(text, /fechamento de estoque/);
    unmount();
  });
});
