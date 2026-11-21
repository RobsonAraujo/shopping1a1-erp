import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OPENING_CHECK_NOTE_PREFIX, openingOwnFor } from "../stock-opening";

describe("openingOwnFor", () => {
  it("galpão digitado que já inclui o depósito: vale o digitado, sem nota", () => {
    assert.deepEqual(openingOwnFor({ legacyWarehouse: 1370, legacyWarehouseListings: 1, depositQty: 197 }), {
      own: 1370,
      note: null,
    });
  });

  it("sem galpão digitado: começa pelo depósito do ML (nunca Galpão negativo)", () => {
    const r = openingOwnFor({ legacyWarehouse: 0, legacyWarehouseListings: 0, depositQty: 40 });
    assert.equal(r.own, 40);
    assert.ok(r.note);
    assert.ok(!r.note.startsWith(OPENING_CHECK_NOTE_PREFIX), "informativo, não pede conferência");
  });

  it("galpão digitado menor que o depósito: usa o depósito e pede conferência", () => {
    const r = openingOwnFor({ legacyWarehouse: 5, legacyWarehouseListings: 1, depositQty: 8 });
    assert.equal(r.own, 8);
    assert.ok(r.note?.startsWith(OPENING_CHECK_NOTE_PREFIX));
  });

  it("galpão em mais de uma opção de venda: soma e pede conferência", () => {
    const r = openingOwnFor({ legacyWarehouse: 200, legacyWarehouseListings: 2, depositQty: 30 });
    assert.equal(r.own, 200);
    assert.ok(r.note?.startsWith(OPENING_CHECK_NOTE_PREFIX));
    assert.match(r.note ?? "", /2 opções de venda/);
  });

  it("leitura do ML falhou: fica com o digitado", () => {
    assert.deepEqual(openingOwnFor({ legacyWarehouse: 12, legacyWarehouseListings: 1, depositQty: null }), {
      own: 12,
      note: null,
    });
  });

  it("nada em casa: zero, sem nota", () => {
    assert.deepEqual(openingOwnFor({ legacyWarehouse: 0, legacyWarehouseListings: 0, depositQty: 0 }), {
      own: 0,
      note: null,
    });
  });
});
