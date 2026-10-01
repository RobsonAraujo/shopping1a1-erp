import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DASHBOARD_COLUMN_COUNT,
  DASHBOARD_PREFERENCES_VERSION,
  MAX_DASHBOARD_VIEWS,
  buildDefaultDashboardPreferences,
  createView,
  deleteView,
  getDefaultView,
  getView,
  moveWidget,
  moveWidgetSideways,
  mergeDashboardViews,
  moveWidgetToColumn,
  normalizeDashboardPreferences,
  renameView,
  resetView,
  setDefaultView,
  setWidgetVisible,
  visibleWidgetIds,
  type DashboardPreferences,
} from "@/lib/home/dashboard/dashboard-preferences";
import type { HomeWidgetDefinition } from "@/lib/home/dashboard/widget-registry";

/** Registry de teste: fixa o comportamento sem depender do catálogo real, que
 * muda toda vez que um widget entra. `banner-um` é faixa; `alpha`/`gamma` ficam
 * na coluna 0 e `beta` na 1 — essa distribuição é o que exercita o agrupamento. */
const DEFS: readonly HomeWidgetDefinition[] = [
  {
    id: "banner-um",
    title: "Faixa",
    description: "",
    category: "atencao",
    icon: (() => null) as unknown as HomeWidgetDefinition["icon"],
    tone: "rose",
    defaultVisible: true,
    defaultOrder: 10,
    layout: "banner",
    defaultColumn: 0,
    source: { kind: "core" },
    priority: "p0",
    pinned: true,
  },
  {
    id: "alpha",
    title: "Alpha",
    description: "",
    category: "operacao",
    icon: (() => null) as unknown as HomeWidgetDefinition["icon"],
    tone: "primary",
    defaultVisible: true,
    defaultOrder: 20,
    layout: "card",
    defaultColumn: 0,
    source: { kind: "core" },
    priority: "p1",
  },
  {
    id: "beta",
    title: "Beta",
    description: "",
    category: "financeiro",
    icon: (() => null) as unknown as HomeWidgetDefinition["icon"],
    tone: "emerald",
    defaultVisible: false,
    defaultOrder: 30,
    layout: "card",
    defaultColumn: 1,
    source: { kind: "batch", dataKey: "finance" },
    priority: "p2",
  },
  {
    id: "gamma",
    title: "Gamma",
    description: "",
    category: "operacao",
    icon: (() => null) as unknown as HomeWidgetDefinition["icon"],
    tone: "violet",
    defaultVisible: true,
    defaultOrder: 40,
    layout: "card",
    defaultColumn: 0,
    source: { kind: "local" },
    priority: "p2",
  },
];

const VIEW = "default";

function ids(prefs: DashboardPreferences): string[] {
  return getDefaultView(prefs).widgets.map((w) => w.id);
}
function columnOf(prefs: DashboardPreferences, id: string): number | undefined {
  return getDefaultView(prefs).widgets.find((w) => w.id === id)?.column;
}
function inColumn(prefs: DashboardPreferences, column: number): string[] {
  return getDefaultView(prefs)
    .widgets.filter((w) => w.id !== "banner-um" && w.column === column)
    .map((w) => w.id);
}
function prefsWith(widgets: unknown[], overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    defaultViewId: VIEW,
    views: [{ id: VIEW, name: "Meu início", widgets }],
    ...overrides,
  };
}

describe("normalizeDashboardPreferences — entradas inválidas caem no default", () => {
  const fallbacks: [string, unknown][] = [
    ["null", null],
    ["undefined", undefined],
    ["array", []],
    ["string", "{"],
    ["number", 42],
    ["versão futura", { version: 2, views: [] }],
    ["sem views", { version: 1 }],
    ["views não-array", { version: 1, views: {} }],
    ["views vazio", { version: 1, views: [] }],
    ["views todas inválidas", { version: 1, views: [{ id: "" }, 7, null] }],
  ];

  for (const [label, raw] of fallbacks) {
    it(`devolve o default para ${label}`, () => {
      assert.deepEqual(
        normalizeDashboardPreferences(raw, DEFS),
        buildDefaultDashboardPreferences(DEFS),
      );
    });
  }
});

describe("normalizeDashboardPreferences — regras de widget", () => {
  it("descarta entradas não-objeto, id desconhecido e id duplicado", () => {
    const prefs = normalizeDashboardPreferences(
      prefsWith([
        { id: "alpha" },
        { id: "alpha" },
        { id: "fantasma" },
        "nope",
        null,
        42,
      ]),
      DEFS,
    );
    const seen = ids(prefs);
    assert.equal(seen.filter((id) => id === "alpha").length, 1);
    assert.ok(!seen.includes("fantasma"));
    assert.deepEqual([...seen].sort(), ["alpha", "banner-um", "beta", "gamma"]);
  });

  it("cai no default quando visible/column vêm inválidos", () => {
    const prefs = normalizeDashboardPreferences(
      prefsWith([
        { id: "alpha", visible: "sim", column: "x" },
        { id: "beta", visible: 1, column: 99 },
        { id: "gamma", column: -5 },
      ]),
      DEFS,
    );
    const widgets = getDefaultView(prefs).widgets;
    assert.equal(widgets.find((w) => w.id === "alpha")?.visible, true);
    assert.equal(widgets.find((w) => w.id === "alpha")?.column, 0);
    assert.equal(widgets.find((w) => w.id === "beta")?.visible, false);
    assert.equal(
      widgets.find((w) => w.id === "beta")?.column,
      DASHBOARD_COLUMN_COUNT - 1,
      "coluna acima da faixa é clampada",
    );
    assert.equal(widgets.find((w) => w.id === "gamma")?.column, 0);
  });

  it("ignora o `size` do formato anterior", () => {
    const prefs = normalizeDashboardPreferences(
      prefsWith([{ id: "alpha", size: "lg", visible: true }]),
      DEFS,
    );
    const alpha = getDefaultView(prefs).widgets.find((w) => w.id === "alpha");
    assert.ok(alpha);
    assert.ok(!("size" in alpha), "campo obsoleto não pode vazar pro modelo novo");
  });

  it("migra activeViewId para defaultViewId preservando os widgets", () => {
    // É o caminho de quem já usou a versão anterior: a versão NÃO é bumpada, e
    // por isso a personalização sobrevive.
    const prefs = normalizeDashboardPreferences(
      {
        version: 1,
        activeViewId: "antiga",
        views: [
          {
            id: "antiga",
            name: "Meu início",
            widgets: [
              { id: "gamma", visible: false, order: 0, size: "sm" },
              { id: "alpha", visible: true, order: 1, size: "md" },
            ],
          },
        ],
      },
      DEFS,
    );
    assert.equal(prefs.defaultViewId, "antiga");
    const widgets = getDefaultView(prefs).widgets;
    assert.equal(widgets.find((w) => w.id === "gamma")?.visible, false);
    assert.equal(widgets.find((w) => w.id === "alpha")?.visible, true);
  });

  it("força widget fixado a visível e mantém faixa na frente", () => {
    const prefs = normalizeDashboardPreferences(
      prefsWith([
        { id: "gamma", order: 0 },
        { id: "alpha", order: 1 },
        { id: "banner-um", visible: false, order: 2 },
      ]),
      DEFS,
    );
    assert.equal(ids(prefs)[0], "banner-um");
    assert.equal(
      getDefaultView(prefs).widgets.find((w) => w.id === "banner-um")?.visible,
      true,
    );
  });

  it("re-sequencia `order` por coluna, não globalmente", () => {
    const prefs = normalizeDashboardPreferences(
      prefsWith([
        { id: "banner-um", order: 0 },
        { id: "alpha", column: 0, order: 5 },
        { id: "gamma", column: 0, order: 9 },
        { id: "beta", column: 1, order: 7 },
      ]),
      DEFS,
    );
    const widgets = getDefaultView(prefs).widgets;
    assert.equal(widgets.find((w) => w.id === "alpha")?.order, 0);
    assert.equal(widgets.find((w) => w.id === "gamma")?.order, 1);
    assert.equal(
      widgets.find((w) => w.id === "beta")?.order,
      0,
      "a outra coluna recomeça do zero",
    );
  });

  it("insere widget novo na coluna default, não no fim", () => {
    const prefs = normalizeDashboardPreferences(
      prefsWith([
        { id: "banner-um", order: 0 },
        { id: "alpha", column: 0, order: 0 },
        { id: "gamma", column: 0, order: 1 },
      ]),
      DEFS,
    );
    assert.deepEqual(inColumn(prefs, 1), ["beta"], "beta entra na coluna dele");
  });

  it("saneia settings: só primitivos, com teto de chaves e de tamanho", () => {
    const prefs = normalizeDashboardPreferences(
      prefsWith([
        {
          id: "alpha",
          settings: {
            ok: "valor",
            num: 3,
            flag: true,
            nested: { a: 1 },
            arr: [1, 2],
            nan: Number.NaN,
            longo: "x".repeat(500),
            ...Object.fromEntries(
              Array.from({ length: 40 }, (_, i) => [`extra${i}`, i]),
            ),
          },
        },
      ]),
      DEFS,
    );
    const settings = getDefaultView(prefs).widgets.find((w) => w.id === "alpha")
      ?.settings;
    assert.ok(settings);
    assert.ok(!("nested" in settings));
    assert.ok(!("arr" in settings));
    assert.ok(!("nan" in settings));
    assert.ok(Object.keys(settings).length <= 20);
    if (typeof settings.longo === "string") {
      assert.equal(settings.longo.length, 200);
    }
  });

  it("cai na primeira view quando defaultViewId não existe", () => {
    const prefs = normalizeDashboardPreferences(
      prefsWith([{ id: "alpha" }], { defaultViewId: "inexistente" }),
      DEFS,
    );
    assert.equal(prefs.defaultViewId, VIEW);
  });

  it("é idempotente para qualquer entrada", () => {
    const inputs: unknown[] = [
      null,
      "{",
      { version: 2 },
      prefsWith([{ id: "alpha", order: 0 }, { id: "alpha", order: 0 }]),
      prefsWith([{ id: "fantasma" }]),
      prefsWith([{ id: "banner-um", visible: false, order: 99 }]),
      prefsWith([{ id: "beta", column: 99 }, { id: "gamma", column: -1 }]),
      prefsWith([{ id: "alpha", size: "lg" }]),
      prefsWith([], { defaultViewId: "nope" }),
      {
        version: 1,
        activeViewId: "x",
        views: [{ id: "x", widgets: [{ id: "alpha", size: "md" }] }],
      },
    ];
    for (const input of inputs) {
      const once = normalizeDashboardPreferences(input, DEFS);
      const twice = normalizeDashboardPreferences(once, DEFS);
      assert.deepEqual(twice, once, `não idempotente: ${JSON.stringify(input)}`);
    }
  });
});

describe("moveWidgetToColumn", () => {
  const base = buildDefaultDashboardPreferences(DEFS);
  const widgets = getDefaultView(base).widgets;

  it("move para outra coluna na posição pedida", () => {
    const next = moveWidgetToColumn(widgets, "gamma", 1, 0, DEFS);
    const gamma = next.find((w) => w.id === "gamma");
    assert.equal(gamma?.column, 1);
    assert.equal(gamma?.order, 0);
    assert.equal(
      next.filter((w) => w.column === 1 && w.id !== "banner-um").length,
      2,
    );
  });

  it("clampa índice acima da faixa para o fim da coluna", () => {
    const next = moveWidgetToColumn(widgets, "gamma", 1, 99, DEFS);
    const column = next.filter((w) => w.column === 1 && w.id !== "banner-um");
    assert.equal(column[column.length - 1]?.id, "gamma");
  });

  it("clampa coluna fora da faixa", () => {
    const next = moveWidgetToColumn(widgets, "alpha", 99, 0, DEFS);
    assert.equal(
      next.find((w) => w.id === "alpha")?.column,
      DASHBOARD_COLUMN_COUNT - 1,
    );
  });

  it("devolve o MESMO array (identidade) em no-op", () => {
    // É o que permite `next === current` valer como "nada mudou" no onDragOver,
    // evitando um setState por movimento de ponteiro.
    assert.equal(moveWidgetToColumn(widgets, "fantasma", 1, 0, DEFS), widgets);
    assert.equal(moveWidgetToColumn(widgets, "banner-um", 1, 0, DEFS), widgets);
    const alpha = widgets.find((w) => w.id === "alpha");
    assert.ok(alpha);
    assert.equal(
      moveWidgetToColumn(widgets, "alpha", alpha.column, alpha.order, DEFS),
      widgets,
      "mesma coluna e mesma posição",
    );
  });

  it("o resultado já está normalizado", () => {
    const next = moveWidgetToColumn(widgets, "gamma", 1, 0, DEFS);
    const prefs = normalizeDashboardPreferences(
      { version: 1, defaultViewId: VIEW, views: [{ id: VIEW, name: "x", widgets: next }] },
      DEFS,
    );
    assert.deepEqual(getDefaultView(prefs).widgets, next);
  });
});

describe("ações de widget", () => {
  const base = buildDefaultDashboardPreferences(DEFS);

  it("setWidgetVisible alterna e ignora widget fixado", () => {
    const hidden = setWidgetVisible(base, VIEW, "alpha", false, DEFS);
    assert.ok(!visibleWidgetIds(hidden).includes("alpha"));
    assert.deepEqual(setWidgetVisible(base, VIEW, "banner-um", false, DEFS), base);
    assert.deepEqual(setWidgetVisible(base, VIEW, "fantasma", false, DEFS), base);
  });

  it("moveWidget é no-op nos extremos da coluna", () => {
    assert.deepEqual(moveWidget(base, VIEW, "alpha", "up", DEFS), base);
    assert.deepEqual(moveWidget(base, VIEW, "gamma", "down", DEFS), base);
    assert.deepEqual(
      inColumn(moveWidget(base, VIEW, "gamma", "up", DEFS), 0),
      ["gamma", "alpha"],
    );
  });

  it("moveWidget não mexe em faixa", () => {
    assert.deepEqual(moveWidget(base, VIEW, "banner-um", "down", DEFS), base);
  });

  it("moveWidgetSideways troca de coluna e respeita os limites", () => {
    assert.deepEqual(moveWidgetSideways(base, VIEW, "alpha", "left", DEFS), base);
    assert.deepEqual(moveWidgetSideways(base, VIEW, "beta", "right", DEFS), base);
    const moved = moveWidgetSideways(base, VIEW, "alpha", "right", DEFS);
    assert.equal(columnOf(moved, "alpha"), 1);
  });

  it("o default já é útil: os widgets visíveis nascem distribuídos", () => {
    assert.equal(base.version, DASHBOARD_PREFERENCES_VERSION);
    assert.deepEqual(visibleWidgetIds(base), ["banner-um", "alpha", "gamma"]);
    assert.deepEqual(inColumn(base, 0), ["alpha", "gamma"]);
    assert.deepEqual(inColumn(base, 1), ["beta"]);
  });
});

describe("versões do dashboard", () => {
  const base = buildDefaultDashboardPreferences(DEFS);

  it("cria a partir da atual, copiando os widgets", () => {
    const hidden = setWidgetVisible(base, VIEW, "alpha", false, DEFS);
    const { preferences, viewId } = createView(
      hidden,
      { name: "Robson", copyFromViewId: VIEW },
      DEFS,
    );
    assert.ok(viewId);
    assert.equal(preferences.views.length, 2);
    assert.equal(
      getView(preferences, viewId).widgets.find((w) => w.id === "alpha")?.visible,
      false,
      "a cópia herda a customização",
    );
    // A principal continua a mesma: criar não muda quem abre o app.
    assert.equal(preferences.defaultViewId, VIEW);
  });

  it("a cópia é independente da origem", () => {
    const { preferences, viewId } = createView(
      base,
      { name: "Jhonattan", copyFromViewId: VIEW },
      DEFS,
    );
    assert.ok(viewId);
    const changed = setWidgetVisible(preferences, viewId, "alpha", false, DEFS);
    assert.equal(
      getView(changed, VIEW).widgets.find((w) => w.id === "alpha")?.visible,
      true,
      "editar a cópia não pode mexer na origem",
    );
  });

  it("cria no padrão quando não copia", () => {
    const hidden = setWidgetVisible(base, VIEW, "alpha", false, DEFS);
    const { preferences, viewId } = createView(hidden, { name: "Nova" }, DEFS);
    assert.ok(viewId);
    assert.equal(
      getView(preferences, viewId).widgets.find((w) => w.id === "alpha")?.visible,
      true,
    );
  });

  it("respeita o teto de versões", () => {
    let prefs = base;
    for (let i = 0; i < MAX_DASHBOARD_VIEWS - 1; i += 1) {
      const result = createView(prefs, { name: `v${i}` }, DEFS);
      assert.ok(result.viewId);
      prefs = result.preferences;
    }
    assert.equal(prefs.views.length, MAX_DASHBOARD_VIEWS);
    const overflow = createView(prefs, { name: "demais" }, DEFS);
    assert.equal(overflow.viewId, null);
    assert.equal(overflow.preferences, prefs, "no-op por identidade");
  });

  it("renomeia com saneamento e ignora id desconhecido", () => {
    const { preferences, viewId } = createView(base, { name: "Robson" }, DEFS);
    assert.ok(viewId);
    assert.equal(
      getView(renameView(preferences, viewId, "   Jhonattan   "), viewId).name,
      "Jhonattan",
    );
    assert.equal(
      getView(renameView(preferences, viewId, "   "), viewId).name,
      "Meu início",
      "nome vazio cai no padrão",
    );
    assert.equal(renameView(preferences, "fantasma", "x"), preferences);
  });

  it("excluir a última versão é no-op", () => {
    assert.equal(deleteView(base, VIEW), base);
  });

  it("excluir a principal promove outra", () => {
    const { preferences, viewId } = createView(base, { name: "Robson" }, DEFS);
    assert.ok(viewId);
    const deleted = deleteView(preferences, VIEW);
    assert.equal(deleted.views.length, 1);
    assert.equal(deleted.defaultViewId, viewId);
    assert.ok(
      deleted.views.some((v) => v.id === deleted.defaultViewId),
      "a principal precisa existir sempre",
    );
  });

  it("setDefaultView ignora id desconhecido", () => {
    assert.equal(setDefaultView(base, "fantasma"), base);
    const { preferences, viewId } = createView(base, { name: "Robson" }, DEFS);
    assert.ok(viewId);
    assert.equal(setDefaultView(preferences, viewId).defaultViewId, viewId);
  });

  it("resetView só mexe na versão pedida", () => {
    const { preferences, viewId } = createView(
      base,
      { name: "Robson", copyFromViewId: VIEW },
      DEFS,
    );
    assert.ok(viewId);
    const customizada = setWidgetVisible(preferences, VIEW, "alpha", false, DEFS);
    const restaurada = resetView(customizada, viewId, DEFS);
    assert.equal(
      getView(restaurada, VIEW).widgets.find((w) => w.id === "alpha")?.visible,
      false,
      "restaurar uma versão não pode tocar nas outras",
    );
    assert.equal(resetView(customizada, "fantasma", DEFS), customizada);
  });

  it("getView cai na principal quando o id não existe", () => {
    assert.equal(getView(base, "fantasma").id, VIEW);
    assert.equal(getView(base, null).id, VIEW);
  });
});

describe("mergeDashboardViews (importação única do localStorage)", () => {
  function withViews(names: string[]): DashboardPreferences {
    let prefs = buildDefaultDashboardPreferences(DEFS);
    prefs = renameView(prefs, prefs.views[0].id, names[0]);
    for (const name of names.slice(1)) {
      prefs = createView(prefs, { name }, DEFS).preferences;
    }
    return prefs;
  }

  it("acrescenta a versão local que o banco ainda não tem", () => {
    const merged = mergeDashboardViews(
      withViews(["Robson"]),
      withViews(["Jhonattan"]),
    );
    assert.deepEqual(
      merged.views.map((v) => v.name),
      ["Robson", "Jhonattan"],
    );
  });

  it("descarta a local cujo nome já existe no banco", () => {
    // O layout é compartilhado: quem carrega depois não pode sobrescrever em
    // silêncio o que já está valendo pra todos.
    const server = withViews(["Robson", "Jhonattan"]);
    const merged = mergeDashboardViews(server, withViews(["Jhonattan"]));
    assert.equal(merged, server, "nada a acrescentar devolve o mesmo objeto");
  });

  it("compara por nome, ignorando caixa e espaço", () => {
    const server = withViews(["Robson"]);
    assert.equal(mergeDashboardViews(server, withViews(["  robson "])), server);
  });

  it("não ultrapassa o teto de versões", () => {
    const names = Array.from({ length: MAX_DASHBOARD_VIEWS }, (_, i) => `S${i}`);
    const merged = mergeDashboardViews(
      withViews(names),
      withViews(["Local A", "Local B"]),
    );
    assert.equal(merged.views.length, MAX_DASHBOARD_VIEWS);
  });

  it("troca o id da local quando ele colide com um do banco", () => {
    // Os ids são locais (`view-1`, `view-2`) e colidem entre navegadores: o
    // «view-1» do Jhonattan não é o «view-1» do Robson.
    const server = withViews(["Robson"]);
    const local = withViews(["Jhonattan"]);
    assert.equal(local.views[0].id, server.views[0].id, "mesmo id nos dois");

    const merged = mergeDashboardViews(server, local);
    const ids = merged.views.map((v) => v.id);
    assert.equal(new Set(ids).size, ids.length, "ids únicos depois do merge");
  });
});
