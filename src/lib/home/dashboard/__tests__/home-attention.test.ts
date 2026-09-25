import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildHomeAttentionSignals,
  hasAnyAttention,
} from "@/lib/home/dashboard/home-attention";
import { emptyHomeCoreSnapshot } from "@/lib/home/dashboard/home-core-types";
import type { HomeCoreSnapshot } from "@/lib/home/dashboard/home-core-types";

function snapshot(overrides: Partial<HomeCoreSnapshot> = {}): HomeCoreSnapshot {
  return { ...emptyHomeCoreSnapshot(), ...overrides };
}

function losing(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    mlItemId: `MLB${i}`,
    sku: `SKU${i}`,
    title: `Item ${i}`,
    imageUrl: null,
    sellerPrice: 100,
    priceToWin: 90,
    gap: 10,
  }));
}

function pendings(overrides: Partial<HomeCoreSnapshot["pendings"] & object> = {}) {
  return {
    failedInventoryRuns: 0,
    pendingDreImports: 0,
    dreMonths: [],
    closedInventoryMonths: [],
    ...overrides,
  };
}

function operations(purchaseInProgress: number, fullInProgress: number) {
  return {
    purchase: { inProgress: purchaseInProgress, final: 0, totalActive: purchaseInProgress },
    full: { inProgress: fullInProgress, final: 0, totalActive: fullInProgress },
    totalActive: purchaseInProgress + fullInProgress,
  };
}

describe("buildHomeAttentionSignals", () => {
  it("não inventa sinal a partir de um snapshot vazio", () => {
    const signals = buildHomeAttentionSignals(snapshot());
    assert.deepEqual(signals, []);
    assert.equal(hasAnyAttention(signals), false);
  });

  it("tolera todas as slices nulas (uma query que falhou não pode derrubar a zona)", () => {
    const signals = buildHomeAttentionSignals(
      snapshot({
        onboarding: null,
        operations: null,
        catalogPoll: null,
        catalog: null,
        pendings: null,
        failedSlices: ["operations", "pendings"],
      }),
    );
    assert.deepEqual(signals, []);
  });

  it("exclui sinais com contagem zero", () => {
    const signals = buildHomeAttentionSignals(
      snapshot({
        operations: operations(0, 0),
        catalog: { productCount: 10, needsCostReviewCount: 0, activeListingCount: 8 },
        pendings: pendings(),
      }),
    );
    assert.deepEqual(signals, []);
  });

  it("ordena por severidade, do mais grave para o menos", () => {
    const signals = buildHomeAttentionSignals(
      snapshot({
        catalogLosing: losing(4),
        catalog: { productCount: 10, needsCostReviewCount: 3, activeListingCount: 8 },
        pendings: pendings({
          failedInventoryRuns: 1,
          pendingDreImports: 2,
          dreMonths: [{ year: 2026, month: 3, syncedAt: null }],
        }),
      }),
    );

    assert.deepEqual(
      signals.map((s) => s.id),
      [
        "inventory-runs-failed",
        "catalog-losing",
        "dre-reconciliation-pending",
        "products-need-cost-review",
        "dre-months-unsynced",
      ],
    );
    // a severidade manda sobre a contagem: 1 falha de estoque antes de 4 do catálogo
    assert.equal(signals[0].count, 1);
    assert.equal(signals[1].count, 4);
  });

  it("não trata trabalho em andamento como pendência", () => {
    // Todo vendedor ativo tem cards no kanban. Se compras/envios em andamento
    // entrassem aqui, a zona ficaria permanentemente cheia e nunca colapsaria —
    // viraria ruído, o oposto do que ela existe pra fazer. Esses números já têm
    // card de KPI próprio.
    const signals = buildHomeAttentionSignals(
      snapshot({ operations: operations(7, 4) }),
    );
    assert.deepEqual(signals, []);
  });

  it("usa tom de perigo só para o que realmente quebrou", () => {
    const signals = buildHomeAttentionSignals(
      snapshot({
        catalogLosing: losing(1),
        pendings: pendings({ failedInventoryRuns: 1, dreMonths: [{ year: 2026, month: 1, syncedAt: null }] }),
      }),
    );
    const byId = new Map(signals.map((s) => [s.id, s]));
    assert.equal(byId.get("inventory-runs-failed")?.tone, "danger");
    assert.equal(byId.get("catalog-losing")?.tone, "danger");
    assert.equal(byId.get("dre-months-unsynced")?.tone, "neutral");
  });

  it("emite exatamente um sinal quando o monitoramento não rodou hoje", () => {
    const idle = buildHomeAttentionSignals(
      snapshot({
        catalogPoll: { todayCount: 0, lastRunAt: null, lastRunSource: null, timezone: "America/Sao_Paulo" },
      }),
    );
    assert.deepEqual(
      idle.map((s) => s.id),
      ["catalog-poll-idle"],
    );
    assert.equal(idle[0].count, 1);

    const running = buildHomeAttentionSignals(
      snapshot({
        catalogPoll: { todayCount: 3, lastRunAt: "2026-09-24T10:00:00.000Z", lastRunSource: "cron", timezone: "America/Sao_Paulo" },
      }),
    );
    assert.deepEqual(running, []);
  });

  it("conta só os meses de DRE sem sincronizar", () => {
    const signals = buildHomeAttentionSignals(
      snapshot({
        pendings: pendings({
          dreMonths: [
            { year: 2026, month: 1, syncedAt: "2026-02-01T00:00:00.000Z" },
            { year: 2026, month: 2, syncedAt: null },
            { year: 2026, month: 3, syncedAt: null },
          ],
        }),
      }),
    );
    const unsynced = signals.find((s) => s.id === "dre-months-unsynced");
    assert.equal(unsynced?.count, 2);
  });

  it("usa singular e plural corretos", () => {
    const one = buildHomeAttentionSignals(snapshot({ catalogLosing: losing(1) }));
    assert.equal(one[0].label, "anúncio perdendo o catálogo");
    const many = buildHomeAttentionSignals(snapshot({ catalogLosing: losing(2) }));
    assert.equal(many[0].label, "anúncios perdendo o catálogo");
  });

  it("todo sinal leva a uma tela onde dá pra agir", () => {
    const signals = buildHomeAttentionSignals(
      snapshot({
        catalogLosing: losing(1),
        catalog: { productCount: 1, needsCostReviewCount: 1, activeListingCount: 1 },
        catalogPoll: { todayCount: 0, lastRunAt: null, lastRunSource: null, timezone: "America/Sao_Paulo" },
        pendings: pendings({
          failedInventoryRuns: 1,
          pendingDreImports: 1,
          dreMonths: [{ year: 2026, month: 1, syncedAt: null }],
        }),
      }),
    );
    assert.equal(signals.length, 6, "todos os seis sinais do catálogo de atenção");
    for (const signal of signals) {
      assert.match(signal.href, /^\/dashboard/, `${signal.id}: href inválido`);
    }
  });
});
