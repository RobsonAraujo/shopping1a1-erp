import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  KANBAN_CARD_DRAG_TYPE,
  kanbanCardDragData,
  kanbanColumnDragData,
  kanbanColumnDropData,
  parseKanbanCardDragData,
  parseKanbanColumnDragData,
  parseKanbanColumnDropData,
  resolveCardDrop,
  resolveCardDropOnCard,
  resolveCardDropOnColumn,
  resolveColumnReorder,
  type KanbanCardRef,
} from "@/lib/kanban/kanban-dnd";
import { KANBAN_POSITION_GAP } from "@/lib/kanban/kanban-position";

const BOARD = "full";

/** col A: a(1024) b(2048) c(3072) — col B: x(1024) — col C: vazia */
const CARDS = new Map<string, KanbanCardRef[]>([
  [
    "A",
    [
      { id: "a", position: 1024 },
      { id: "b", position: 2048 },
      { id: "c", position: 3072 },
    ],
  ],
  ["B", [{ id: "x", position: 1024 }]],
  ["C", []],
]);

const edgeOf = (data: Record<string | symbol, unknown>) =>
  (data.edge as "top" | "bottom" | "left" | "right" | undefined) ?? null;

describe("leitura dos dados do pdnd", () => {
  it("aceita o que a gente mesmo produziu", () => {
    assert.deepEqual(parseKanbanCardDragData(kanbanCardDragData(BOARD, "a", "A", 80), BOARD), {
      type: KANBAN_CARD_DRAG_TYPE,
      boardId: BOARD,
      cardId: "a",
      columnId: "A",
      height: 80,
    });
    assert.ok(parseKanbanColumnDragData(kanbanColumnDragData(BOARD, "A"), BOARD));
    assert.ok(parseKanbanColumnDropData(kanbanColumnDropData(BOARD, "A"), BOARD));
  });

  it("rejeita dado de outro board, de outro tipo ou malformado", () => {
    assert.equal(parseKanbanCardDragData(kanbanCardDragData("purchase", "a", "A"), BOARD), null);
    assert.equal(parseKanbanCardDragData(kanbanColumnDragData(BOARD, "A"), BOARD), null);
    assert.equal(parseKanbanCardDragData({ type: KANBAN_CARD_DRAG_TYPE, boardId: BOARD }, BOARD), null);
    assert.equal(parseKanbanCardDragData(null, BOARD), null);
    assert.equal(parseKanbanColumnDropData({ type: "home-column" }, BOARD), null);
  });

  it("descarta altura inválida em vez de propagar", () => {
    assert.equal(kanbanCardDragData(BOARD, "a", "A", 0).height, undefined);
    assert.equal(kanbanCardDragData(BOARD, "a", "A", Number.NaN).height, undefined);
  });
});

describe("resolveCardDropOnCard", () => {
  it("entra entre os vizinhos certos pela borda", () => {
    // c acima de b → entre a e b
    assert.deepEqual(
      resolveCardDropOnCard(CARDS, { cardId: "c", columnId: "A" }, { cardId: "b", columnId: "A" }, "top"),
      { columnId: "A", position: 1536 },
    );
    // a abaixo de b → entre b e c
    assert.deepEqual(
      resolveCardDropOnCard(CARDS, { cardId: "a", columnId: "A" }, { cardId: "b", columnId: "A" }, "bottom"),
      { columnId: "A", position: 2560 },
    );
  });

  it("vai pro topo e pro fim de outra coluna", () => {
    assert.deepEqual(
      resolveCardDropOnCard(CARDS, { cardId: "a", columnId: "A" }, { cardId: "x", columnId: "B" }, "top"),
      { columnId: "B", position: 1024 - KANBAN_POSITION_GAP },
    );
    assert.deepEqual(
      resolveCardDropOnCard(CARDS, { cardId: "a", columnId: "A" }, { cardId: "x", columnId: "B" }, "bottom"),
      { columnId: "B", position: 1024 + KANBAN_POSITION_GAP },
    );
  });

  it("soltar no mesmo lugar não é movimento", () => {
    assert.equal(
      resolveCardDropOnCard(CARDS, { cardId: "b", columnId: "A" }, { cardId: "b", columnId: "A" }, "top"),
      null,
    );
    // b abaixo de a = onde b já está
    assert.equal(
      resolveCardDropOnCard(CARDS, { cardId: "b", columnId: "A" }, { cardId: "a", columnId: "A" }, "bottom"),
      null,
    );
    // b acima de c = onde b já está
    assert.equal(
      resolveCardDropOnCard(CARDS, { cardId: "b", columnId: "A" }, { cardId: "c", columnId: "A" }, "top"),
      null,
    );
  });

  it("sem borda conta como acima", () => {
    assert.deepEqual(
      resolveCardDropOnCard(CARDS, { cardId: "c", columnId: "A" }, { cardId: "a", columnId: "A" }, null),
      { columnId: "A", position: 1024 - KANBAN_POSITION_GAP },
    );
  });
});

describe("resolveCardDropOnColumn", () => {
  it("vai pro fim da coluna", () => {
    assert.deepEqual(resolveCardDropOnColumn(CARDS, { cardId: "a", columnId: "A" }, "B"), {
      columnId: "B",
      position: 1024 + KANBAN_POSITION_GAP,
    });
    assert.deepEqual(resolveCardDropOnColumn(CARDS, { cardId: "a", columnId: "A" }, "C"), {
      columnId: "C",
      position: 0,
    });
  });

  it("o último da própria coluna soltando no vazio não se move", () => {
    assert.equal(resolveCardDropOnColumn(CARDS, { cardId: "c", columnId: "A" }, "A"), null);
    assert.deepEqual(resolveCardDropOnColumn(CARDS, { cardId: "a", columnId: "A" }, "A"), {
      columnId: "A",
      position: 3072 + KANBAN_POSITION_GAP,
    });
  });

  it("coluna desconhecida é ignorada", () => {
    assert.equal(resolveCardDropOnColumn(CARDS, { cardId: "a", columnId: "A" }, "Z"), null);
  });
});

describe("resolveCardDrop", () => {
  it("o card mais interno ganha da coluna", () => {
    const targets = [
      { data: { ...kanbanCardDragData(BOARD, "x", "B"), edge: "bottom" } },
      { data: { ...kanbanColumnDropData(BOARD, "B") } },
    ];
    assert.deepEqual(resolveCardDrop(CARDS, { cardId: "a", columnId: "A" }, BOARD, targets, edgeOf), {
      columnId: "B",
      position: 1024 + KANBAN_POSITION_GAP,
    });
  });

  it("só a coluna sob o cursor = fim dela; alvo de outro board é ignorado", () => {
    assert.deepEqual(
      resolveCardDrop(
        CARDS,
        { cardId: "a", columnId: "A" },
        BOARD,
        [{ data: { ...kanbanColumnDropData("purchase", "C") } }, { data: { ...kanbanColumnDropData(BOARD, "C") } }],
        edgeOf,
      ),
      { columnId: "C", position: 0 },
    );
    assert.equal(resolveCardDrop(CARDS, { cardId: "a", columnId: "A" }, BOARD, [], edgeOf), null);
  });
});

describe("resolveColumnReorder", () => {
  const COLUMNS = [
    { id: "first", isLocked: true },
    { id: "m1", isLocked: false },
    { id: "m2", isLocked: false },
    { id: "m3", isLocked: false },
    { id: "last", isLocked: true },
  ];

  it("move pela borda esquerda/direita do alvo", () => {
    assert.deepEqual(resolveColumnReorder(COLUMNS, "m3", "m1", "left"), ["first", "m3", "m1", "m2", "last"]);
    assert.deepEqual(resolveColumnReorder(COLUMNS, "m1", "m3", "right"), ["first", "m2", "m3", "m1", "last"]);
  });

  it("nunca passa das colunas travadas", () => {
    assert.deepEqual(resolveColumnReorder(COLUMNS, "m2", "first", "left"), ["first", "m2", "m1", "m3", "last"]);
    assert.deepEqual(resolveColumnReorder(COLUMNS, "m2", "last", "right"), ["first", "m1", "m3", "m2", "last"]);
  });

  it("coluna travada não se move e soltar no mesmo lugar é nada", () => {
    assert.equal(resolveColumnReorder(COLUMNS, "first", "m2", "right"), null);
    assert.equal(resolveColumnReorder(COLUMNS, "m2", "m2", "left"), null);
    assert.equal(resolveColumnReorder(COLUMNS, "m2", "m1", "right"), null);
    assert.equal(resolveColumnReorder(COLUMNS, "m2", "m3", "left"), null);
  });
});
