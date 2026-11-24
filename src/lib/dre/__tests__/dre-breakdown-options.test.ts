import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mergeLineBreakdowns,
  mergeProductCostBreakdowns,
  type DreLineBreakdownItem,
  type DreProductCostBreakdownItem,
} from "../dre-calculations";
import { breakdownKeyForProduct, groupBreakdownByProduct } from "../dre-breakdown-options";

const principalOf = (id: string) => (id === "MLB-PREMIUM" ? "MLB-CLASSICO" : id);

describe("breakdownKeyForProduct", () => {
  it("moves an option line to the principal, keeping the cost origin suffix", () => {
    assert.equal(breakdownKeyForProduct("item:MLB-PREMIUM", principalOf), "item:MLB-CLASSICO");
    assert.equal(
      breakdownKeyForProduct("item:MLB-PREMIUM::leveled", principalOf),
      "item:MLB-CLASSICO::leveled",
    );
    assert.equal(breakdownKeyForProduct("missing:MLB-PREMIUM", principalOf), "missing:MLB-CLASSICO");
    assert.equal(breakdownKeyForProduct("item:MLB-OUTRO", principalOf), "item:MLB-OUTRO");
    assert.equal(breakdownKeyForProduct("kit:MLB-KIT", principalOf), "kit:MLB-KIT");
  });
});

describe("groupBreakdownByProduct", () => {
  it("joins the option lines into the product and keeps the month total", () => {
    const lines: DreLineBreakdownItem[] = [
      { key: "item:MLB-PREMIUM", sku: "CABO", title: "Cabo (Premium)", quantity: 2, amount: 120 },
      { key: "item:MLB-CLASSICO", sku: "CABO", title: "Cabo", quantity: 10, amount: 500 },
      { key: "item:MLB-OUTRO", sku: "OUTRO", title: "Outro", quantity: 1, amount: 30 },
    ];
    const grouped = groupBreakdownByProduct(lines, principalOf, mergeLineBreakdowns)!;
    assert.equal(grouped.length, 2);
    const product = grouped.find((l) => l.key === "item:MLB-CLASSICO")!;
    assert.equal(product.quantity, 12);
    assert.equal(product.amount, 620);
    // A linha somada fica com o título do principal.
    assert.equal(product.title, "Cabo");
    const total = (list: DreLineBreakdownItem[]) => list.reduce((s, l) => s + l.amount, 0);
    assert.equal(total(grouped), total(lines));
  });

  it("keeps the leveled and the cadastro cost lines apart", () => {
    const items: DreProductCostBreakdownItem[] = [
      { key: "item:MLB-CLASSICO::cadastro", sku: "CABO", title: "Cabo", quantity: 10, unitCost: 20, totalCost: 200, missingCost: false },
      { key: "item:MLB-PREMIUM::cadastro", sku: "CABO", title: "Cabo", quantity: 2, unitCost: 20, totalCost: 40, missingCost: false },
      { key: "item:MLB-PREMIUM::leveled", sku: "CABO", title: "Cabo", quantity: 1, unitCost: 18, totalCost: 18, missingCost: false, leveled: true },
    ];
    const grouped = groupBreakdownByProduct(items, principalOf, mergeProductCostBreakdowns)!;
    assert.deepEqual(
      grouped.map((i) => [i.key, i.quantity, i.totalCost]).sort(),
      [
        ["item:MLB-CLASSICO::cadastro", 12, 240],
        ["item:MLB-CLASSICO::leveled", 1, 18],
      ],
    );
  });

  it("returns the same list when nothing is an option", () => {
    const lines: DreLineBreakdownItem[] = [
      { key: "item:MLB-OUTRO", sku: "OUTRO", title: "Outro", quantity: 1, amount: 30 },
    ];
    assert.equal(groupBreakdownByProduct(lines, principalOf, mergeLineBreakdowns), lines);
  });
});
