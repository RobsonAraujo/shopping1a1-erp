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
});
