import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { completedShare } from "@/lib/home/dashboard/operations-kpi";

describe("completedShare", () => {
  it("é 0 quando não há ciclo nenhum (evita divisão por zero)", () => {
    assert.equal(completedShare(0, 0), 0);
  });

  it("é 100 quando tudo já foi concluído", () => {
    assert.equal(completedShare(0, 7), 100);
  });

  it("é 0 quando nada foi concluído", () => {
    assert.equal(completedShare(7, 0), 0);
  });

  it("arredonda pro inteiro mais próximo", () => {
    assert.equal(completedShare(2, 1), 33);
    assert.equal(completedShare(1, 2), 67);
    assert.equal(completedShare(1, 1), 50);
  });
});
