import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { act, renderIntoDocument } from "@/test-setup/render";
import {
  TaxActionOverlay,
  TaxReportGenerationOverlay,
  type TaxReportProgressState,
} from "@/components/relatorio-tributario/TaxReportGenerationOverlay";

const overlay = () =>
  document.body.querySelector('[role="alertdialog"][aria-busy="true"]');

describe("TaxReportGenerationOverlay", () => {
  it("never moves the bar backwards through the steps the server sends", () => {
    const steps: TaxReportProgressState[] = [
      { phase: "orders", message: "Buscando pedidos" },
      { phase: "billing", message: "Dados fiscais", current: 0, total: 100 },
      { phase: "billing", message: "Dados fiscais", current: 100, total: 100 },
      { phase: "compute", message: "Carregando custos" },
      { phase: "compute", message: "Calculando", current: 0, total: 100 },
      { phase: "compute", message: "Calculando", current: 100, total: 100 },
      { phase: "save", message: "Salvando" },
      { phase: "done", message: "Salvo" },
    ];
    const view = renderIntoDocument(
      <TaxReportGenerationOverlay progress={steps[0]} />,
    );
    const widths = steps.map((progress) => {
      view.rerender(<TaxReportGenerationOverlay progress={progress} />);
      const bar = overlay()?.querySelector<HTMLElement>('[style*="width"]');
      return Number.parseFloat(bar?.style.width ?? "");
    });
    assert.deepEqual(
      widths,
      [...widths].sort((a, b) => a - b),
      `a barra recuou: ${widths.join(" → ")}`,
    );
    assert.equal(widths.at(-1), 100);
    view.unmount();
  });

  it("explains a long save only once the wait is noticeable, and restarts the count", () => {
    mock.timers.enable({ apis: ["setInterval"] });
    try {
      const save: TaxReportProgressState = { phase: "save", message: "Salvando" };
      const view = renderIntoDocument(<TaxReportGenerationOverlay progress={save} />);

      act(() => mock.timers.tick(4_000));
      assert.doesNotMatch(overlay()?.textContent ?? "", /Salvando há/);

      act(() => mock.timers.tick(1_000));
      assert.match(overlay()?.textContent ?? "", /Salvando há 5 s/);

      // O DRE é outra mensagem da mesma etapa: o contador continua de onde estava.
      view.rerender(
        <TaxReportGenerationOverlay
          progress={{ phase: "save", message: "Atualizando o imposto do DRE" }}
        />,
      );
      act(() => mock.timers.tick(60_000));
      assert.match(overlay()?.textContent ?? "", /Salvando há 1 min 5 s/);

      view.rerender(
        <TaxReportGenerationOverlay progress={{ phase: "done", message: "Salvo" }} />,
      );
      assert.doesNotMatch(overlay()?.textContent ?? "", /Salvando há/);

      view.rerender(<TaxReportGenerationOverlay progress={save} />);
      assert.doesNotMatch(overlay()?.textContent ?? "", /Salvando há/);
      view.unmount();
    } finally {
      mock.timers.reset();
    }
  });

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
