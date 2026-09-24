import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { productDeleteBlockedMessage } from "../product-delete-guard";

describe("productDeleteBlockedMessage", () => {
  it("allows removing a product with no dependencies", () => {
    assert.equal(
      productDeleteBlockedMessage({
        warehouseQuantity: 0,
        levelingCount: 0,
        kitCount: 0,
      }),
      null,
    );
  });

  it("blocks a product that is a kit component", () => {
    // `KitItem` é onDelete: Cascade — sem este bloqueio o componente some do
    // kit e o custo calculado do kit cai em silêncio.
    const message = productDeleteBlockedMessage({
      warehouseQuantity: 0,
      levelingCount: 0,
      kitCount: 1,
    });
    assert.match(message ?? "", /participação em 1 kit/);
    assert.match(message ?? "", /Desative o produto em vez de remover/);
  });

  it("blocks a product that has DRE cost levelings", () => {
    const message = productDeleteBlockedMessage({
      warehouseQuantity: 0,
      levelingCount: 4,
      kitCount: 0,
    });
    assert.match(message ?? "", /4 nivelamentos de custo no DRE/);
  });

  it("suggests zeroing stock only when stock is the sole blocker", () => {
    const stockOnly = productDeleteBlockedMessage({
      warehouseQuantity: 3,
      levelingCount: 0,
      kitCount: 0,
    });
    assert.match(stockOnly ?? "", /3 unidades no galpão/);
    assert.match(stockOnly ?? "", /Zere o estoque/);

    // Com outro impedimento junto, zerar o estoque não desbloquearia nada —
    // sugerir isso seria uma dica falsa.
    const stockPlusKit = productDeleteBlockedMessage({
      warehouseQuantity: 3,
      levelingCount: 0,
      kitCount: 2,
    });
    assert.doesNotMatch(stockPlusKit ?? "", /Zere o estoque/);
    assert.match(stockPlusKit ?? "", /Desative o produto em vez de remover/);
  });

  it("lists every blocker in one message", () => {
    const message = productDeleteBlockedMessage({
      warehouseQuantity: 1,
      levelingCount: 2,
      kitCount: 3,
    });
    assert.equal(
      message,
      "Não dá para remover este produto: 1 unidade no galpão, 2 nivelamentos de custo no DRE e participação em 3 kits. " +
        "Desative o produto em vez de remover — ele sai das telas do dia a dia e o histórico (DRE, kits e relatórios) continua correto.",
    );
  });
});
