import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { act, renderIntoDocument } from "@/test-setup/render";
import { dreRecalcLineKey } from "@/components/dre/dre-recalc";
import type { DreEditableLineKey } from "@/lib/dre/dre-calculations";
import {
  dreTable,
  editableValue,
  flush,
  openEditor,
  pressKey,
  text,
  typeValue,
  yearView,
  type LineChange,
} from "./dre-table-test-utils";

const data = yearView();

describe("DreYearTable — recálculo depois de uma edição manual", () => {
  it("mostra o valor novo na célula editada, borra o resto do mês e volta no erro", async () => {
    const calls: [DreEditableLineKey, number, number][] = [];
    const onLineChange: LineChange = (lineKey, month, amount) => {
      calls.push([lineKey, month, amount]);
    };
    const view = renderIntoDocument(dreTable({ data, onLineChange }));
    const revenueLabel = "Faturamento ML (Mês 1)";

    assert.equal(document.querySelectorAll('[aria-busy="true"]').length, 0);

    const input = await openEditor(view.container, revenueLabel);
    await typeValue(input, "R$ 1.500,00");
    await pressKey(input, "Enter");
    assert.deepEqual(calls, [["revenueMl", 1, 1500]]);

    // O pai (DreClient) marca o mês como recalculando até o ano voltar.
    view.rerender(
      dreTable({
        data,
        onLineChange,
        recalc: { month: 1, editedKey: dreRecalcLineKey("revenueMl") },
      }),
    );
    const edited = editableValue(view.container, revenueLabel);
    assert.equal(text(edited), "R$ 1.500,00");
    assert.doesNotMatch(edited.className, /blur-\[3px\]/);

    const saleFee = editableValue(view.container, "Tarifa ML (Mês 1)");
    assert.match(saleFee.className, /blur-\[3px\]/);
    assert.ok(
      document.querySelectorAll('[aria-busy="true"]').length > 1,
      "subtotais e resultado do mês ficam borrados",
    );
    assert.match(
      text(view.container.querySelector('[role="status"]') ?? document.body),
      /Recalculando…/,
    );

    // Outra edição não abre enquanto recalcula.
    await act(async () => {
      saleFee.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    await flush();
    assert.equal(
      document.querySelector('input[aria-label="Editar Tarifa ML (Mês 1)"]'),
      null,
    );

    // Falhou (os dados não mudaram): a célula volta ao valor do servidor.
    view.rerender(dreTable({ data, onLineChange }));
    assert.equal(text(editableValue(view.container, revenueLabel)), "R$ 1.000,00");
    assert.equal(document.querySelectorAll('[aria-busy="true"]').length, 0);
    assert.equal(view.container.querySelector('[role="status"]'), null);
    view.unmount();
  });

  it("na visão Comparar meses borra só a coluna do mês editado", async () => {
    const view = renderIntoDocument(dreTable({ data }));
    const yearToggle = [...view.container.querySelectorAll("button")].find((button) =>
      text(button).includes("Comparar meses"),
    );
    assert.ok(yearToggle);
    await act(async () => {
      yearToggle.click();
    });

    view.rerender(dreTable({ data, recalc: { month: 1, editedKey: null } }));
    assert.match(
      editableValue(view.container, "Tarifa ML (Mês 1)").className,
      /blur-\[3px\]/,
    );
    assert.doesNotMatch(
      editableValue(view.container, "Faturamento ML (Mês 2)").className,
      /blur-\[3px\]/,
    );
    const yearTotal = view.container.querySelector(
      '[title="Clique para auditar Faturamento ML (ano)"]',
    );
    assert.ok(yearTotal, "coluna Total");
    assert.equal(yearTotal.closest('[aria-busy="true"]'), null);
    assert.equal(yearTotal.querySelector('[aria-busy="true"]'), null);

    const headerStatus = view.container.querySelector('th [role="status"]');
    assert.ok(headerStatus, "spinner no cabeçalho do mês");
    assert.match(text(headerStatus), /recalculando Mês 1/);
    view.unmount();
  });
});
