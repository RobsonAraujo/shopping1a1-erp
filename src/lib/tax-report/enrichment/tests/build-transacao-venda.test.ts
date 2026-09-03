import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTransacoesFromOrder } from "@/lib/tax-report/enrichment/build-transacao-venda";

describe("buildTransacoesFromOrder", () => {
  it("marks missing billing_info as dadosFiscaisIndisponiveis", () => {
    const rows = buildTransacoesFromOrder({
      order: {
        id: 99,
        status: "paid",
        order_items: [
          {
            quantity: 1,
            unit_price: 50,
            item: { id: "MLB1", seller_sku: "SKU-A" },
          },
        ],
      },
      billing: null,
      itemById: new Map(),
      custoBySku: new Map(),
      contributorByCnpj: new Map(),
    });

    assert.equal(rows.length, 1);
    assert.equal(rows[0].dadosFiscaisIndisponiveis, true);
    assert.equal(rows[0].sku, "SKU-A");
  });

  it("rateia o custo de frete do pedido entre as linhas proporcionalmente à receita", () => {
    const rows = buildTransacoesFromOrder({
      order: {
        id: 100,
        status: "paid",
        order_items: [
          {
            quantity: 1,
            unit_price: 300,
            item: { id: "MLB1", seller_sku: "SKU-A" },
          },
          {
            quantity: 1,
            unit_price: 100,
            item: { id: "MLB2", seller_sku: "SKU-B" },
          },
        ],
      },
      billing: null,
      itemById: new Map(),
      custoBySku: new Map(),
      contributorByCnpj: new Map(),
      freightCostByOrderId: new Map([["100", 40]]),
    });

    assert.equal(rows.length, 2);
    // receita total do pedido: 400; SKU-A = 75% -> 30; SKU-B = 25% -> 10
    assert.equal(rows[0].freightCost, 30);
    assert.equal(rows[1].freightCost, 10);
  });

  it("frete fica zero quando o pedido não tem custo de frete conhecido", () => {
    const rows = buildTransacoesFromOrder({
      order: {
        id: 101,
        status: "paid",
        order_items: [
          {
            quantity: 1,
            unit_price: 50,
            item: { id: "MLB1", seller_sku: "SKU-A" },
          },
        ],
      },
      billing: null,
      itemById: new Map(),
      custoBySku: new Map(),
      contributorByCnpj: new Map(),
    });

    assert.equal(rows[0].freightCost, 0);
  });

  it("usa o SKU efetivo (resolvido via mlItemId) em vez do texto de SKU da linha do pedido", () => {
    // Caso motivador da migração: o vendedor editou o SKU do anúncio no ML
    // depois que o anúncio já estava vinculado a um Product — a linha do
    // pedido ainda carrega o SKU antigo, mas a venda deve ficar sob o SKU
    // cadastrado (efetivo), não duplicar como um produto novo.
    const rows = buildTransacoesFromOrder({
      order: {
        id: 200,
        status: "paid",
        order_items: [
          {
            quantity: 1,
            unit_price: 50,
            item: { id: "MLB1", seller_sku: "SKU-ANTIGO-NO-PEDIDO" },
          },
        ],
      },
      billing: null,
      itemById: new Map(),
      custoBySku: new Map(),
      contributorByCnpj: new Map(),
      effectiveSkuByItemId: new Map([["MLB1", "SKU-CADASTRADO"]]),
    });

    assert.equal(rows.length, 1);
    assert.equal(rows[0].sku, "SKU-CADASTRADO");
  });

  it("cai no SKU da linha do pedido quando não há SKU efetivo pro item", () => {
    const rows = buildTransacoesFromOrder({
      order: {
        id: 201,
        status: "paid",
        order_items: [
          {
            quantity: 1,
            unit_price: 50,
            item: { id: "MLB2", seller_sku: "SKU-SEM-VINCULO" },
          },
        ],
      },
      billing: null,
      itemById: new Map(),
      custoBySku: new Map(),
      contributorByCnpj: new Map(),
      effectiveSkuByItemId: new Map([["MLB2", null]]),
    });

    assert.equal(rows[0].sku, "SKU-SEM-VINCULO");
  });
});
