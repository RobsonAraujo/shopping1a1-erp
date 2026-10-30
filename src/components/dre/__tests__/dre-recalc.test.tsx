import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderIntoDocument } from "@/test-setup/render";
import {
  dreRecalcCostKey,
  dreRecalcLineKey,
  DreRecalcProvider,
  DreRecalcStatus,
  DreRecalcValue,
  isDreRecalculating,
  type DreRecalc,
} from "@/components/dre/dre-recalc";

function renderValue(recalc: DreRecalc | null, month: number) {
  const view = renderIntoDocument(
    <DreRecalcProvider value={recalc}>
      <DreRecalcValue month={month}>R$ 1.000,00</DreRecalcValue>
    </DreRecalcProvider>,
  );
  const node = view.container.firstElementChild as HTMLElement;
  return { view, node };
}

describe("dre-recalc", () => {
  it("só a coluna do mês editado está recalculando", () => {
    const recalc: DreRecalc = { month: 3, editedKey: dreRecalcLineKey("revenueMl") };
    assert.equal(isDreRecalculating(recalc, 3), true);
    assert.equal(isDreRecalculating(recalc, 4), false);
    assert.equal(isDreRecalculating(null, 3), false);
  });

  it("identifica a célula editada por linha ou item de custo", () => {
    assert.equal(dreRecalcLineKey("revenueMl"), "line:revenueMl");
    assert.equal(dreRecalcCostKey("cost_1"), "cost:cost_1");
  });

  it("borra o valor da coluna que recalcula e deixa as outras nítidas", () => {
    const recalc: DreRecalc = { month: 3, editedKey: null };

    const same = renderValue(recalc, 3);
    assert.match(same.node.className, /blur-\[3px\]/);
    assert.equal(same.node.getAttribute("aria-busy"), "true");
    same.view.unmount();

    const other = renderValue(recalc, 4);
    assert.doesNotMatch(other.node.className, /blur-\[3px\]/);
    assert.equal(other.node.getAttribute("aria-busy"), null);
    other.view.unmount();

    const idle = renderValue(null, 3);
    assert.doesNotMatch(idle.node.className, /blur-\[3px\]/);
    idle.view.unmount();
  });

  it("anuncia o recálculo para leitor de tela", () => {
    const view = renderIntoDocument(<DreRecalcStatus />);
    const status = view.container.querySelector('[role="status"]');
    assert.ok(status);
    assert.match(status.textContent ?? "", /Recalculando…/);
    view.unmount();
  });
});
