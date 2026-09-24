import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  indexPmaLookup,
  resolvePmaPrice,
} from "../financial-evaluation-data";

describe("PMA lookup da Lucratividade", () => {
  it("resolve pelo mlItemId do próprio anúncio", () => {
    const lookup = indexPmaLookup([
      { mlItemId: "MLB1", sku: "SKU-A", pmaPrice: 90 },
    ]);
    assert.equal(resolvePmaPrice(lookup, "MLB1", "SKU-A"), 90);
  });

  it("não vaza o PMA de um anúncio para outro que só compartilha o texto do SKU", () => {
    // `Product.sku` não é único. Casando só por SKU, MLB2 herdava o PMA de
    // MLB1 e ganhava o selo "Abaixo do PMA" sem ter PMA cadastrado.
    const lookup = indexPmaLookup([
      { mlItemId: "MLB1", sku: "SKU-A", pmaPrice: 90 },
      { mlItemId: "MLB2", sku: "SKU-A", pmaPrice: null },
    ]);
    assert.equal(resolvePmaPrice(lookup, "MLB2", "SKU-A"), null);
  });

  it("cai no SKU quando o anúncio não tem Product vinculado por mlItemId", () => {
    // Vendedor sem vínculo por identidade ainda precisa ver o PMA.
    const lookup = indexPmaLookup([
      { mlItemId: "MLB1", sku: "SKU-A", pmaPrice: 90 },
    ]);
    assert.equal(resolvePmaPrice(lookup, "MLB-OUTRO", "SKU-A"), 90);
    assert.equal(resolvePmaPrice(lookup, "MLB-OUTRO", " SKU-A "), 90);
  });

  it("devolve null sem SKU e sem vínculo — anúncio de quem nem cadastra SKU", () => {
    const lookup = indexPmaLookup([
      { mlItemId: "MLB1", sku: null, pmaPrice: 90 },
    ]);
    assert.equal(resolvePmaPrice(lookup, "MLB1", null), 90);
    assert.equal(resolvePmaPrice(lookup, "MLB-OUTRO", null), null);
  });

  it("no fallback por SKU, o primeiro registro vence", () => {
    const lookup = indexPmaLookup([
      { mlItemId: "MLB1", sku: "SKU-A", pmaPrice: 90 },
      { mlItemId: "MLB2", sku: "SKU-A", pmaPrice: 50 },
    ]);
    assert.equal(resolvePmaPrice(lookup, "MLB-OUTRO", "SKU-A"), 90);
    assert.equal(resolvePmaPrice(lookup, "MLB2", "SKU-A"), 50);
  });
});
