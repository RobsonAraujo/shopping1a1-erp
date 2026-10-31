import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { act, renderIntoDocument } from "@/test-setup/render";
import type { DreEditableLineKey } from "@/lib/dre/dre-calculations";
import {
  dreTable,
  openEditor,
  pressKey,
  text,
  typeValue,
  yearView,
  type LineChange,
} from "./dre-table-test-utils";

function signButton(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>('button[aria-label^="Valor "]');
}

function recorder() {
  const calls: [DreEditableLineKey, number, number][] = [];
  const onLineChange: LineChange = (lineKey, month, amount) => {
    calls.push([lineKey, month, amount]);
  };
  return { calls, onLineChange };
}

describe("DreYearTable — sinal na edição manual", () => {
  it("custo começa em \"−\": digitar 45000 em Tarifa ML grava −45.000", async () => {
    const { calls, onLineChange } = recorder();
    const view = renderIntoDocument(dreTable({ data: yearView(), onLineChange }));

    const input = await openEditor(view.container, "Tarifa ML (Mês 1)");
    const button = signButton();
    assert.ok(button, "botão de sinal no editor");
    assert.equal(button.getAttribute("aria-pressed"), "true");
    assert.equal(text(button), "−");

    await typeValue(input, "R$ 45.000,00");
    await pressKey(input, "Enter");
    assert.deepEqual(calls, [["saleFeeMl", 1, -45000]]);
    view.unmount();
  });

  it("o botão troca para \"+\" e grava positivo (estorno maior que a cobrança)", async () => {
    const { calls, onLineChange } = recorder();
    const view = renderIntoDocument(dreTable({ data: yearView(), onLineChange }));

    const input = await openEditor(view.container, "Tarifa ML (Mês 1)");
    await act(async () => {
      signButton()!.click();
    });
    assert.equal(signButton()!.getAttribute("aria-pressed"), "false");
    assert.equal(text(signButton()!), "+");

    await typeValue(input, "R$ 300,00");
    await pressKey(input, "Enter");
    assert.deepEqual(calls, [["saleFeeMl", 1, 300]]);
    view.unmount();
  });

  it("parte do sinal do valor atual e troca com as teclas - e +", async () => {
    const { calls, onLineChange } = recorder();
    // Mês com crédito: Tarifas especiais positiva.
    const view = renderIntoDocument(
      dreTable({ data: yearView({ specialFeesMl: 50 }), onLineChange }),
    );

    const input = await openEditor(view.container, "Tarifas especiais (Mês 1)");
    assert.equal(text(signButton()!), "+");
    assert.equal(input.value.includes("-"), false, "o campo mostra só o número");

    await pressKey(input, "-");
    assert.equal(text(signButton()!), "−");
    await typeValue(input, "R$ 20,00");
    await pressKey(input, "Enter");
    assert.deepEqual(calls, [["specialFeesMl", 1, -20]]);
    view.unmount();
  });

  it("linha de custo zerada começa no sinal natural (\"−\")", async () => {
    const view = renderIntoDocument(dreTable({ data: yearView() }));
    await openEditor(view.container, "Tarifa de devolução (Mês 1)");
    assert.equal(text(signButton()!), "−");
    view.unmount();
  });

  it("Faturamento ML não tem botão de sinal", async () => {
    const view = renderIntoDocument(dreTable({ data: yearView() }));
    await openEditor(view.container, "Faturamento ML (Mês 1)");
    assert.equal(signButton(), null);
    view.unmount();
  });
});
