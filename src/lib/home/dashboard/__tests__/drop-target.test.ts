import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HOME_COLUMN_DROP_TYPE,
  HOME_WIDGET_DRAG_TYPE,
  homeColumnDropData,
  homeWidgetDragData,
  parseColumnDropData,
  parseWidgetDragData,
  resolveDropFromTargets,
  resolveDropOnColumn,
  resolveDropOnWidget,
} from "@/lib/home/dashboard/drop-target";
import {
  moveWidgetToColumn,
  type DashboardWidgetPreference,
} from "@/lib/home/dashboard/dashboard-preferences";
import type { HomeWidgetDefinition } from "@/lib/home/dashboard/widget-registry";

function w(id: string, column: number, order: number): DashboardWidgetPreference {
  return { id, visible: true, column, order };
}

/** col 0: a, b, c — col 1: x, y */
const WIDGETS: DashboardWidgetPreference[] = [
  w("a", 0, 0),
  w("b", 0, 1),
  w("c", 0, 2),
  w("x", 1, 0),
  w("y", 1, 1),
];

describe("leitura dos dados do pdnd", () => {
  it("aceita o que a gente mesmo produziu", () => {
    assert.deepEqual(parseWidgetDragData(homeWidgetDragData("a", 1)), {
      type: HOME_WIDGET_DRAG_TYPE,
      widgetId: "a",
      column: 1,
    });
    assert.deepEqual(parseColumnDropData(homeColumnDropData(1)), {
      type: HOME_COLUMN_DROP_TYPE,
      column: 1,
    });
  });

  it("rejeita dado de outra origem ou malformado", () => {
    // O pdnd entrega `Record<string | symbol, unknown>`: qualquer draggable da
    // página cai aqui, então validar não é paranoia.
    assert.equal(parseWidgetDragData(null), null);
    assert.equal(parseWidgetDragData(undefined), null);
    assert.equal(parseWidgetDragData({}), null);
    assert.equal(parseWidgetDragData({ type: "outra-coisa" }), null);
    assert.equal(parseWidgetDragData({ type: HOME_WIDGET_DRAG_TYPE }), null);
    assert.equal(
      parseWidgetDragData({ type: HOME_WIDGET_DRAG_TYPE, widgetId: "", column: 0 }),
      null,
    );
    assert.equal(
      parseWidgetDragData({ type: HOME_WIDGET_DRAG_TYPE, widgetId: "a", column: 1.5 }),
      null,
    );
    assert.equal(parseColumnDropData({ type: HOME_COLUMN_DROP_TYPE }), null);
    assert.equal(
      parseColumnDropData({ type: HOME_COLUMN_DROP_TYPE, column: "1" }),
      null,
    );
  });

  it("não confunde card com coluna", () => {
    assert.equal(parseColumnDropData(homeWidgetDragData("a", 0)), null);
    assert.equal(parseWidgetDragData(homeColumnDropData(0)), null);
  });
});

describe("resolveDropOnWidget", () => {
  it("borda de cima cai antes, de baixo cai depois", () => {
    // "c" subindo para cima de "a" — o caso que motivou a troca de biblioteca
    assert.deepEqual(resolveDropOnWidget(WIDGETS, "c", "a", "top"), {
      column: 0,
      index: 0,
    });
    assert.deepEqual(resolveDropOnWidget(WIDGETS, "c", "a", "bottom"), {
      column: 0,
      index: 1,
    });
  });

  it("o índice exclui o card que está sendo movido", () => {
    // sem excluir, mover "a" pra baixo de "b" daria 2 e pularia o "c"
    assert.deepEqual(resolveDropOnWidget(WIDGETS, "a", "b", "bottom"), {
      column: 0,
      index: 1,
    });
  });

  it("assume a coluna do card alvo", () => {
    assert.deepEqual(resolveDropOnWidget(WIDGETS, "a", "y", "top"), {
      column: 1,
      index: 1,
    });
    assert.deepEqual(resolveDropOnWidget(WIDGETS, "a", "y", "bottom"), {
      column: 1,
      index: 2,
    });
  });

  it("borda ausente ou horizontal cai em 'antes'", () => {
    // Só pedimos top/bottom ao hitbox, mas o tipo permite os quatro.
    assert.deepEqual(resolveDropOnWidget(WIDGETS, "c", "a", null), {
      column: 0,
      index: 0,
    });
    assert.deepEqual(resolveDropOnWidget(WIDGETS, "c", "a", "left"), {
      column: 0,
      index: 0,
    });
  });

  it("devolve null quando não há o que fazer", () => {
    assert.equal(resolveDropOnWidget(WIDGETS, "a", "a", "top"), null);
    assert.equal(resolveDropOnWidget(WIDGETS, "fantasma", "a", "top"), null);
    assert.equal(resolveDropOnWidget(WIDGETS, "a", "fantasma", "top"), null);
  });
});

describe("resolveDropOnColumn", () => {
  it("vai pro fim da coluna", () => {
    assert.deepEqual(resolveDropOnColumn(WIDGETS, "a", 1), { column: 1, index: 2 });
  });

  it("na própria coluna, não conta a si mesmo", () => {
    assert.deepEqual(resolveDropOnColumn(WIDGETS, "a", 0), { column: 0, index: 2 });
  });

  it("coluna vazia recebe no índice 0", () => {
    const soCol0 = WIDGETS.filter((x) => x.column === 0);
    assert.deepEqual(resolveDropOnColumn(soCol0, "a", 1), { column: 1, index: 0 });
  });

  it("recusa id desconhecido e coluna inválida", () => {
    assert.equal(resolveDropOnColumn(WIDGETS, "fantasma", 0), null);
    assert.equal(resolveDropOnColumn(WIDGETS, "a", -1), null);
    assert.equal(resolveDropOnColumn(WIDGETS, "a", 1.5), null);
  });
});

describe("resolveDropFromTargets", () => {
  const edgeOf = (data: Record<string | symbol, unknown>) =>
    (data.__edge as "top" | "bottom" | undefined) ?? null;

  it("o card ganha da coluna (lista vem do mais interno pra fora)", () => {
    const target = resolveDropFromTargets(
      WIDGETS,
      "a",
      [
        { data: { ...homeWidgetDragData("y", 1), __edge: "bottom" } },
        { data: homeColumnDropData(1) },
      ],
      edgeOf,
    );
    assert.deepEqual(target, { column: 1, index: 2 });
  });

  it("sem card sob o cursor, a coluna responde", () => {
    const target = resolveDropFromTargets(
      WIDGETS,
      "a",
      [{ data: homeColumnDropData(1) }],
      edgeOf,
    );
    assert.deepEqual(target, { column: 1, index: 2 });
  });

  it("ignora alvos que não são nossos", () => {
    const target = resolveDropFromTargets(
      WIDGETS,
      "a",
      [{ data: { type: "algo-de-outra-feature" } }, { data: homeColumnDropData(1) }],
      edgeOf,
    );
    assert.deepEqual(target, { column: 1, index: 2 });
  });

  it("sem alvo nenhum, devolve null", () => {
    assert.equal(resolveDropFromTargets(WIDGETS, "a", [], edgeOf), null);
    assert.equal(
      resolveDropFromTargets(WIDGETS, "a", [{ data: { type: "nada" } }], edgeOf),
      null,
    );
  });
});


/**
 * Registry sintético com uma **faixa na coluna 0** — que é a situação real da
 * Home (`atencao` e `onboarding` são faixas e ficam na coluna 0).
 */
function def(
  id: string,
  layout: "banner" | "card",
  defaultColumn: number,
  defaultOrder: number,
): HomeWidgetDefinition {
  return {
    id,
    title: id,
    description: "",
    category: "operacao",
    icon: (() => null) as unknown as HomeWidgetDefinition["icon"],
    tone: "primary",
    defaultVisible: true,
    defaultOrder,
    layout,
    defaultColumn,
    source: { kind: "core" },
    priority: "p1",
  };
}

const DEFS_COM_FAIXA: readonly HomeWidgetDefinition[] = [
  def("faixa", "banner", 0, 10),
  def("a", "card", 0, 20),
  def("b", "card", 0, 30),
  def("c", "card", 0, 40),
  def("x", "card", 1, 50),
];

/** Faixa em column 0, como no normalizador real, seguida dos cards. */
const COM_FAIXA: DashboardWidgetPreference[] = [
  w("faixa", 0, 0),
  w("a", 0, 0),
  w("b", 0, 1),
  w("c", 0, 2),
  w("x", 1, 0),
];

describe("faixas não contam no índice (bug da coluna esquerda)", () => {
  it("o índice da coluna 0 ignora as faixas", () => {
    // Era o bug: `others` incluía a faixa, então o índice saía inflado, o
    // `moveWidgetToColumn` clampava e o card caía no fim da coluna. Só acontecia
    // na coluna da esquerda, porque é lá que as faixas moram.
    assert.deepEqual(
      resolveDropOnWidget(COM_FAIXA, "c", "a", "top", DEFS_COM_FAIXA),
      { column: 0, index: 0 },
    );
    assert.deepEqual(
      resolveDropOnWidget(COM_FAIXA, "c", "b", "bottom", DEFS_COM_FAIXA),
      { column: 0, index: 2 },
    );
  });

  it("a área vazia da coluna 0 também ignora as faixas", () => {
    assert.deepEqual(
      resolveDropOnColumn(COM_FAIXA, "x", 0, DEFS_COM_FAIXA),
      { column: 0, index: 3 },
    );
  });

  it("o índice resolvido casa com o que moveWidgetToColumn faz", () => {
    // O teste que realmente importa: as duas funções precisam ter a MESMA
    // convenção de índice, senão o card não cai onde a linha indicou.
    const target = resolveDropOnWidget(COM_FAIXA, "c", "a", "top", DEFS_COM_FAIXA);
    assert.ok(target);
    const next = moveWidgetToColumn(
      COM_FAIXA,
      "c",
      target.column,
      target.index,
      DEFS_COM_FAIXA,
    );
    const col0 = next
      .filter((x) => x.id !== "faixa" && x.column === 0)
      .map((x) => x.id);
    assert.deepEqual(col0, ["c", "a", "b"], "o card cai onde a linha indicou");
  });
});
