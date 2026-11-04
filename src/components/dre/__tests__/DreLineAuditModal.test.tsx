import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderIntoDocument } from "@/test-setup/render";
import { DreLineAuditModal } from "@/components/dre/DreLineAuditModal";
import type { DreLineBreakdownItem } from "@/lib/dre/dre-calculations";

function item(overrides: Partial<DreLineBreakdownItem>): DreLineBreakdownItem {
  return {
    key: "op-1",
    sku: "SKU-1",
    title: "Cabo",
    quantity: 1,
    amount: -8.45,
    ...overrides,
  };
}

function render(items: DreLineBreakdownItem[]) {
  return renderIntoDocument(
    <DreLineAuditModal
      open
      rowLabel="Frete vendedor"
      title="out."
      description="Lançamentos do mês."
      amountLabel="Valor"
      items={items}
      onClose={() => {}}
    />,
  );
}

/** Tira os espaços do formato de moeda para comparar sem depender do NBSP. */
function bodyText(): string {
  return (document.body.textContent ?? "").replace(/\s+/g, " ");
}

describe("DreLineAuditModal — frete pago pelo comprador", () => {
  it("mostra cobrado − comprador = linha e anota a operação", () => {
    const view = render([
      item({ key: "a", amount: -6.95, buyerPaidAmount: 10.99 }),
      item({ key: "b", amount: -8.45 }),
    ]);
    const text = bodyText();
    assert.match(text, /Cobrado pelo ML R\$ 26,39/);
    assert.match(text, /Pago pelo comprador R\$ 10,99/);
    assert.match(text, /= Frete vendedor R\$ 15,40/);
    assert.match(text, /comprador pagou R\$ 10,99/);
    view.unmount();
  });

  it("não mostra nada quando o comprador não pagou frete", () => {
    const view = render([item({ key: "b", amount: -8.45 })]);
    const text = bodyText();
    assert.doesNotMatch(text, /Pago pelo comprador/);
    assert.doesNotMatch(text, /comprador pagou/);
    view.unmount();
  });
});
