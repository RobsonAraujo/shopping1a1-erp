import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { act, renderIntoDocument } from "@/test-setup/render";
import {
  TaxActionOverlay,
  TaxReportGenerationOverlay,
} from "@/components/relatorio-tributario/TaxReportGenerationOverlay";

const overlay = () =>
  document.body.querySelector('[role="alertdialog"][aria-busy="true"]');

describe("TaxReportGenerationOverlay", () => {
  it("blocks the screen with the step, the progress and a cancel button", () => {
    let cancelled = 0;
    const view = renderIntoDocument(
      <TaxReportGenerationOverlay
        title="Recalculando o tributário de set/2026"
        progress={{ phase: "billing", message: "Dados fiscais: 10/100", current: 10, total: 100 }}
        note="No fim, o imposto do DRE do mês é atualizado."
        onCancel={() => (cancelled += 1)}
      />,
    );
    assert.ok(overlay(), "expected a blocking overlay on the page");
    const text = overlay()?.textContent ?? "";
    assert.match(text, /Recalculando o tributário de set\/2026/);
    assert.match(text, /10 de 100 pedidos/);
    assert.match(text, /imposto do DRE do mês é atualizado/);
    const cancel = [...document.body.querySelectorAll("button")].find(
      (b) => b.textContent === "Cancelar",
    );
    act(() => cancel!.click());
    assert.equal(cancelled, 1);
    view.unmount();
  });

  it("disables cancel once it is saving — the save can no longer be undone", () => {
    const view = renderIntoDocument(
      <TaxReportGenerationOverlay
        progress={{ phase: "save", message: "Atualizando o imposto do DRE do mês…" }}
        onCancel={() => {}}
      />,
    );
    const cancel = [...document.body.querySelectorAll("button")].find(
      (b) => b.textContent === "Cancelar",
    );
    assert.equal(cancel?.disabled, true);
    view.unmount();
  });
});

describe("TaxActionOverlay", () => {
  it("blocks the screen with what is happening", () => {
    const view = renderIntoDocument(
      <TaxActionOverlay
        title="Atualizando o imposto de set/2026"
        message="Aplicando o % de cada produto do relatório tributário salvo."
      />,
    );
    assert.match(overlay()?.textContent ?? "", /Atualizando o imposto de set\/2026/);
    view.unmount();
    assert.equal(overlay(), null);
  });
});
