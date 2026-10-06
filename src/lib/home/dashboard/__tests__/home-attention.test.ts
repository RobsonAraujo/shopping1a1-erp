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

function losingRows(count: number) {
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

/** `total` acompanha a prévia por default — quem precisa divergir passa os dois. */
function losing(count: number, total: number = count) {
  return { rows: losingRows(count), total };
}

function pendings(
  overrides: Partial<HomeCoreSnapshot["pendings"] & object> = {},
): NonNullable<HomeCoreSnapshot["pendings"]> {
  const base = {
    failedInventoryRuns: 0,
    pendingDreImports: 0,
    pendingDreImportMonths: [],
    dreMonths: [],
    closedInventoryMonths: [],
    /** Ano de referência fixo: o rótulo de mês depende dele, e um teste que
     * dependesse do relógio quebraria sozinho em 1º de janeiro. */
    year: 2026,
    ...overrides,
  };
  // A contagem acompanha a lista, como no loader — senão o teste afirmaria um
  // estado que o produto não consegue produzir.
  return overrides.pendingDreImports === undefined &&
    base.pendingDreImportMonths.length > 0
    ? { ...base, pendingDreImports: base.pendingDreImportMonths.length }
    : base;
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

  it("conta o total do banco, não o tamanho da prévia", () => {
    // O snapshot traz só as 5 piores linhas. Se o sinal contasse `rows.length`,
    // o aviso diria "5 anúncios perdendo o catálogo" num catálogo com 37 — o
    // número do card viria do corte, não do banco.
    const signals = buildHomeAttentionSignals(
      snapshot({ catalogLosing: losing(5, 37) }),
    );
    assert.equal(
      signals.find((s) => s.id === "catalog-losing")?.count,
      37,
    );
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

describe("meses das pendências de DRE", () => {
  function signalById(core: HomeCoreSnapshot, id: string) {
    return buildHomeAttentionSignals(core).find((s) => s.id === id);
  }

  it("o sinal de conciliação nomeia os meses", () => {
    // É a regressão deste pedido: antes dizia só "5 conciliações de DRE
    // pendentes" e o usuário não sabia onde agir.
    const signal = signalById(
      snapshot({
        pendings: pendings({
          pendingDreImportMonths: [
            { year: 2026, month: 2 },
            { year: 2026, month: 3 },
          ],
        }),
      }),
      "dre-reconciliation-pending",
    );

    assert.equal(signal?.detail, "fev. e mar.");
    assert.equal(signal?.detailFull, "fev. e mar.");
  });

  it("a contagem vem da lista de meses, nunca de outra leitura", () => {
    // Pega a volta de um `count()` separado: o número do pill e a lista ao lado
    // dele não podem divergir.
    const months = [
      { year: 2026, month: 1 },
      { year: 2026, month: 2 },
      { year: 2026, month: 3 },
    ];
    const signal = signalById(
      snapshot({ pendings: pendings({ pendingDreImportMonths: months }) }),
      "dre-reconciliation-pending",
    );
    assert.equal(signal?.count, months.length);
  });

  it("o ano de referência vem do snapshot, não do relógio", () => {
    // Se a função lesse `new Date()`, este teste quebraria sozinho na virada do
    // ano — e o HTML do servidor divergiria do da hidratação.
    const month = [{ year: 2025, month: 12 }];

    const asOf2026 = signalById(
      snapshot({
        pendings: pendings({ pendingDreImportMonths: month, year: 2026 }),
      }),
      "dre-reconciliation-pending",
    );
    assert.equal(asOf2026?.detail, "dez./2025", "ano diferente: leva o ano");

    const asOf2025 = signalById(
      snapshot({
        pendings: pendings({ pendingDreImportMonths: month, year: 2025 }),
      }),
      "dre-reconciliation-pending",
    );
    assert.equal(asOf2025?.detail, "dez.", "mesmo ano: sem o ano");
  });

  it("corta no pill e mantém a lista inteira no detalhe completo", () => {
    const months = Array.from({ length: 7 }, (_, i) => ({
      year: 2026,
      month: i + 1,
    }));
    const signal = signalById(
      snapshot({ pendings: pendings({ pendingDreImportMonths: months }) }),
      "dre-reconciliation-pending",
    );

    assert.match(signal?.detail ?? "", /\+4$/);
    assert.match(signal?.detailFull ?? "", /jul\.$/);
  });

  it("o link leva pro ano quando todas as pendências são de um ano só", () => {
    const of = (months: { year: number; month: number }[]) =>
      signalById(
        snapshot({ pendings: pendings({ pendingDreImportMonths: months }) }),
        "dre-reconciliation-pending",
      )?.href;

    assert.equal(
      of([{ year: 2025, month: 11 }, { year: 2025, month: 12 }]),
      "/dashboard/dre?ano=2025",
    );
    // Misturado: o ano corrente é o melhor destino, porque é onde está a maioria.
    assert.equal(
      of([{ year: 2025, month: 12 }, { year: 2026, month: 2 }]),
      "/dashboard/dre",
    );
    assert.equal(of([{ year: 2026, month: 2 }]), "/dashboard/dre");
  });

  it("meses sem sincronizar também são nomeados, e só os sem sync", () => {
    const signal = signalById(
      snapshot({
        pendings: pendings({
          dreMonths: [
            { year: 2026, month: 1, syncedAt: "2026-02-01T00:00:00.000Z" },
            { year: 2026, month: 2, syncedAt: null },
            { year: 2026, month: 3, syncedAt: null },
          ],
        }),
      }),
      "dre-months-unsynced",
    );

    assert.equal(signal?.count, 2);
    assert.equal(signal?.detail, "fev. e mar.");
    assert.ok(
      !signal?.detailFull?.includes("jan."),
      "o mês sincronizado não entra",
    );
  });

  it("sinal sem meses não ganha detalhe nenhum", () => {
    // String vazia renderizaria um separador "·" solto no pill.
    const signal = signalById(
      snapshot({
        catalog: { productCount: 10, needsCostReviewCount: 3, activeListingCount: 8 },
      }),
      "products-need-cost-review",
    );
    assert.equal(signal?.detail, undefined);
    assert.equal(signal?.detailFull, undefined);
  });
});
