import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  KANBAN_POSITION_GAP,
  positionAtEnd,
  positionAtTop,
  positionBetween,
  renormalizedPositions,
} from "@/lib/kanban/kanban-position";

describe("positionBetween", () => {
  it("usa o ponto médio entre os dois vizinhos", () => {
    assert.equal(positionBetween(1024, 2048), 1536);
    assert.equal(positionBetween(-10, 10), 0);
  });

  it("abre um GAP acima do primeiro quando não há vizinho de cima", () => {
    assert.equal(positionBetween(null, 1024), 1024 - KANBAN_POSITION_GAP);
    assert.equal(positionBetween(undefined, -500), -500 - KANBAN_POSITION_GAP);
  });

  it("abre um GAP abaixo do último quando não há vizinho de baixo", () => {
    assert.equal(positionBetween(3072, null), 3072 + KANBAN_POSITION_GAP);
  });

  it("começa em 0 numa coluna vazia", () => {
    assert.equal(positionBetween(), 0);
    assert.equal(positionBetween(null, null), 0);
  });

  it("ignora vizinho não finito em vez de propagar NaN", () => {
    assert.equal(positionBetween(Number.NaN, 2048), 2048 - KANBAN_POSITION_GAP);
  });
});

describe("positionAtTop / positionAtEnd", () => {
  it("entra antes do menor e depois do maior, em qualquer ordem de entrada", () => {
    assert.equal(positionAtTop([3000, 1000, 2000]), 1000 - KANBAN_POSITION_GAP);
    assert.equal(positionAtEnd([3000, 1000, 2000]), 3000 + KANBAN_POSITION_GAP);
  });

  it("coluna vazia começa em 0", () => {
    assert.equal(positionAtTop([]), 0);
    assert.equal(positionAtEnd([]), 0);
  });
});

describe("renormalizedPositions", () => {
  it("não faz nada enquanto os vãos ainda são grandes", () => {
    assert.equal(renormalizedPositions([0, 1024, 1536, 1537]), null);
    assert.equal(renormalizedPositions([]), null);
  });

  it("renumera mantendo a ordem quando dois valores distintos encostam", () => {
    const map = renormalizedPositions([10, 1, 1.0000000001, 5]);
    assert.ok(map);
    assert.deepEqual(
      [1, 1.0000000001, 5, 10].map((v) => map.get(v)),
      [1, 2, 3, 4].map((i) => i * KANBAN_POSITION_GAP),
    );
  });

  it("valores iguais (ciclos do mesmo fornecedor) não contam como vão e continuam iguais", () => {
    assert.equal(renormalizedPositions([512, 512, 512, 2048]), null);
    const map = renormalizedPositions([512, 512, 512.0000000001, 2048]);
    assert.ok(map);
    assert.equal(map.get(512), KANBAN_POSITION_GAP);
    assert.equal(map.get(512.0000000001), 2 * KANBAN_POSITION_GAP);
  });

  it("aguenta muitos drops seguidos no mesmo vão antes de precisar renumerar", () => {
    let low = 0;
    const high = KANBAN_POSITION_GAP;
    let drops = 0;
    while (renormalizedPositions([low, high, positionBetween(low, high)]) === null) {
      low = positionBetween(low, high);
      drops += 1;
    }
    assert.ok(drops >= 25, `renumerou cedo demais: ${drops}`);
    // E nunca chega a colidir de fato antes disso.
    assert.notEqual(positionBetween(low, high), low);
  });
});
