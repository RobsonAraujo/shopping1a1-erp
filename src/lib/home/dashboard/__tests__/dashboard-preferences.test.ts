import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDefaultDashboardPreferences,
  DASHBOARD_PREFERENCES_VERSION,
  getActiveView,
  moveWidget,
  normalizeDashboardPreferences,
  reorderWidgets,
  setWidgetSize,
  setWidgetVisible,
  visibleWidgetIds,
  type DashboardPreferences,
} from "@/lib/home/dashboard/dashboard-preferences";
import type { HomeWidgetDefinition } from "@/lib/home/dashboard/widget-registry";

/** Registry de teste: fixa o comportamento sem depender do catálogo real,
 * que vai mudar toda vez que um widget novo for adicionado. */
const DEFS: readonly HomeWidgetDefinition[] = [
  {
    id: "pinned-one",
    title: "Fixado",
    description: "",
    category: "atencao",
    icon: (() => null) as unknown as HomeWidgetDefinition["icon"],
    tone: "rose",
    defaultVisible: true,
    defaultOrder: 10,
    supportedSizes: ["md", "lg"],
    defaultSize: "lg",
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
    supportedSizes: ["sm", "md"],
    defaultSize: "sm",
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
    supportedSizes: ["md"],
    defaultSize: "md",
    source: { kind: "batch", dataKey: "finance" },
    priority: "p2",
  },
  {
    id: "gamma",
    title: "Gamma",
    description: "",
    category: "estoque",
    icon: (() => null) as unknown as HomeWidgetDefinition["icon"],
    tone: "violet",
    defaultVisible: true,
    defaultOrder: 40,
    supportedSizes: ["sm"],
    defaultSize: "sm",
    source: { kind: "local" },
    priority: "p2",
  },
];

function ids(prefs: DashboardPreferences): string[] {
  return getActiveView(prefs).widgets.map((w) => w.id);
}

function prefsWith(
  widgets: unknown[],
  overrides: Record<string, unknown> = {},
): unknown {
  return {
    version: 1,
    activeViewId: "default",
    views: [{ id: "default", name: "Meu início", widgets }],
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
    // os ausentes foram inseridos a partir do registry
    assert.deepEqual([...seen].sort(), ["alpha", "beta", "gamma", "pinned-one"]);
  });

  it("cai no default quando visible/size vêm inválidos", () => {
    const prefs = normalizeDashboardPreferences(
      prefsWith([
        { id: "alpha", visible: "sim", size: "xl" },
        { id: "beta", visible: 1, size: "sm" },
      ]),
      DEFS,
    );
    const widgets = getActiveView(prefs).widgets;
    const alpha = widgets.find((w) => w.id === "alpha");
    const beta = widgets.find((w) => w.id === "beta");
    assert.equal(alpha?.visible, true, "default da definição");
    assert.equal(alpha?.size, "sm", "size fora de supportedSizes vira default");
    assert.equal(beta?.visible, false);
    assert.equal(beta?.size, "md", "'sm' não é suportado por beta");
  });

  it("força widget fixado a visível, mesmo com o storage dizendo o contrário", () => {
    const prefs = normalizeDashboardPreferences(
      prefsWith([{ id: "pinned-one", visible: false }]),
      DEFS,
    );
    const pinned = getActiveView(prefs).widgets.find(
      (w) => w.id === "pinned-one",
    );
    assert.equal(pinned?.visible, true);
  });

  it("mantém widget fixado no topo mesmo se o storage o jogou pro fim", () => {
    const prefs = normalizeDashboardPreferences(
      prefsWith([
        { id: "gamma", order: 0 },
        { id: "alpha", order: 1 },
        { id: "beta", order: 2 },
        { id: "pinned-one", order: 3 },
      ]),
      DEFS,
    );
    assert.equal(ids(prefs)[0], "pinned-one");
  });

  it("ordena por `order` quando todos têm, e re-sequencia a partir da posição", () => {
    const prefs = normalizeDashboardPreferences(
      prefsWith([
        { id: "gamma", order: 30 },
        { id: "alpha", order: 10 },
        { id: "beta", order: 20 },
        { id: "pinned-one", order: 0 },
      ]),
      DEFS,
    );
    assert.deepEqual(ids(prefs), ["pinned-one", "alpha", "beta", "gamma"]);
    assert.deepEqual(
      getActiveView(prefs).widgets.map((w) => w.order),
      [0, 1, 2, 3],
    );
  });

  it("usa a ordem do array quando `order` está duplicado ou ausente", () => {
    const duplicated = normalizeDashboardPreferences(
      prefsWith([
        { id: "gamma", order: 0 },
        { id: "alpha", order: 0 },
        { id: "beta", order: 0 },
      ]),
      DEFS,
    );
    assert.deepEqual(duplicated.views[0].widgets.map((w) => w.id).slice(1), [
      "gamma",
      "alpha",
      "beta",
    ]);

    const missingOrder = normalizeDashboardPreferences(
      prefsWith([{ id: "beta" }, { id: "gamma" }, { id: "alpha" }]),
      DEFS,
    );
    assert.deepEqual(ids(missingOrder).slice(1), ["beta", "gamma", "alpha"]);
  });

  it("insere widget novo na posição default, não no fim", () => {
    // usuário só tinha os extremos gravados; `beta` (defaultOrder 30) precisa
    // entrar ENTRE alpha (20) e gamma (40) — no fim ninguém veria a novidade.
    const prefs = normalizeDashboardPreferences(
      prefsWith([
        { id: "pinned-one", order: 0 },
        { id: "alpha", order: 1 },
        { id: "gamma", order: 2 },
      ]),
      DEFS,
    );
    assert.deepEqual(ids(prefs), ["pinned-one", "alpha", "beta", "gamma"]);
  });

  it("preserva a customização válida ao lado do que foi descartado", () => {
    const prefs = normalizeDashboardPreferences(
      prefsWith([
        { id: "gamma", visible: false, order: 0 },
        { id: "fantasma", order: 1 },
        { id: "alpha", visible: true, size: "md", order: 2 },
      ]),
      DEFS,
    );
    const widgets = getActiveView(prefs).widgets;
    assert.equal(widgets.find((w) => w.id === "gamma")?.visible, false);
    assert.equal(widgets.find((w) => w.id === "alpha")?.size, "md");
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
    const settings = getActiveView(prefs).widgets.find(
      (w) => w.id === "alpha",
    )?.settings;
    assert.ok(settings);
    assert.ok(!("nested" in settings));
    assert.ok(!("arr" in settings));
    assert.ok(!("nan" in settings));
    assert.ok(Object.keys(settings).length <= 20);
    if (typeof settings.longo === "string") {
      assert.equal(settings.longo.length, 200);
    }
    for (const value of Object.values(settings)) {
      assert.ok(["string", "number", "boolean"].includes(typeof value));
    }
  });

  it("cai na primeira view quando activeViewId não existe", () => {
    const prefs = normalizeDashboardPreferences(
      prefsWith([{ id: "alpha" }], { activeViewId: "inexistente" }),
      DEFS,
    );
    assert.equal(prefs.activeViewId, "default");
  });

  it("é idempotente para qualquer entrada", () => {
    const inputs: unknown[] = [
      null,
      "{",
      { version: 2 },
      prefsWith([{ id: "alpha", order: 0 }, { id: "alpha", order: 0 }]),
      prefsWith([{ id: "fantasma" }]),
      prefsWith([{ id: "pinned-one", visible: false, order: 99 }]),
      prefsWith([{ id: "beta", size: "xl" }, { id: "gamma" }]),
      prefsWith([], { activeViewId: "nope" }),
    ];
    for (const input of inputs) {
      const once = normalizeDashboardPreferences(input, DEFS);
      const twice = normalizeDashboardPreferences(once, DEFS);
      assert.deepEqual(twice, once, `não idempotente para ${JSON.stringify(input)}`);
    }
  });
});

describe("ações de preferência", () => {
  const base = buildDefaultDashboardPreferences(DEFS);

  it("setWidgetVisible alterna e ignora widget fixado", () => {
    const hidden = setWidgetVisible(base, "alpha", false, DEFS);
    assert.ok(!visibleWidgetIds(hidden).includes("alpha"));
    assert.deepEqual(setWidgetVisible(base, "pinned-one", false, DEFS), base);
    assert.deepEqual(setWidgetVisible(base, "fantasma", false, DEFS), base);
  });

  it("setWidgetSize recusa tamanho não suportado", () => {
    assert.equal(
      getActiveView(setWidgetSize(base, "alpha", "md", DEFS)).widgets.find(
        (w) => w.id === "alpha",
      )?.size,
      "md",
    );
    assert.deepEqual(setWidgetSize(base, "gamma", "lg", DEFS), base);
  });

  it("moveWidget é no-op nos extremos e não atravessa a zona fixada", () => {
    // alpha é o primeiro não-fixado: subir esbarraria em pinned-one
    assert.deepEqual(moveWidget(base, "alpha", "up", DEFS), base);
    assert.deepEqual(moveWidget(base, "gamma", "down", DEFS), base);
    assert.deepEqual(moveWidget(base, "pinned-one", "down", DEFS), base);
    assert.deepEqual(ids(moveWidget(base, "beta", "up", DEFS)), [
      "pinned-one",
      "beta",
      "alpha",
      "gamma",
    ]);
  });

  it("reorderWidgets mantém o conjunto completo com lista parcial ou suja", () => {
    const next = reorderWidgets(base, ["gamma", "fantasma", "gamma", "beta"]);
    assert.deepEqual(ids(next), ["gamma", "beta", "pinned-one", "alpha"]);
    // normalizar depois traz o fixado de volta pro topo, sem perder ninguém
    assert.deepEqual(ids(normalizeDashboardPreferences(next, DEFS)), [
      "pinned-one",
      "gamma",
      "beta",
      "alpha",
    ]);
  });

  it("o default já é útil: os widgets p0 nascem visíveis", () => {
    assert.equal(base.version, DASHBOARD_PREFERENCES_VERSION);
    assert.deepEqual(visibleWidgetIds(base), ["pinned-one", "alpha", "gamma"]);
  });
});
