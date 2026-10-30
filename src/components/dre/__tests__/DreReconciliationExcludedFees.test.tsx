import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { act, renderIntoDocument } from "@/test-setup/render";
import { DreReconciliationExcludedFees } from "@/components/dre/DreReconciliationExcludedFees";
import type { ExcludedFeeSummary } from "@/lib/dre/reconciliation/types";

const LOAN: ExcludedFeeSummary = {
  name: "Juros do empréstimo",
  reason: "non_operational",
  total: -6373.08,
  occurrences: 1,
  samples: [
    {
      rowIndex: 2028,
      operationDate: "2026-10-23",
      operationId: "73996779726",
      operationType: "Movimentações de empréstimo",
      feeId: "73996779726",
      amount: -6373.08,
      billingPeriod: "2026-11",
      closingDate: "2026-11-04",
    },
  ],
};

const DIFAL: ExcludedFeeSummary = {
  name: "Cobrança do diferencial de alíquota interestadual (ICMS-DIFAL)",
  reason: "in_sales_tax",
  total: -1287.4,
  occurrences: 115,
  samples: [
    {
      rowIndex: 105,
      operationDate: "2026-10-28",
      operationId: "74346756344",
      operationType: "Cobrança de DIFAL",
      feeId: "74346756344",
      amount: -13.05,
      billingPeriod: "2026-11",
      closingDate: "2026-11-04",
    },
  ],
};

describe("DreReconciliationExcludedFees", () => {
  it("não mostra nada sem cobrança fora", () => {
    const view = renderIntoDocument(<DreReconciliationExcludedFees fees={[]} />);
    assert.equal(view.container.textContent, "");
    view.unmount();
  });

  it("mostra o total, o motivo de cada cobrança e o caminho para achá-la", () => {
    const view = renderIntoDocument(
      <DreReconciliationExcludedFees fees={[LOAN, DIFAL]} />,
    );
    const text = view.container.textContent ?? "";
    assert.match(text, /Ficaram fora do DRE/);
    assert.match(text, /Saídas não operacionais/);
    assert.match(text, /Já está em Impostos sobre vendas/);
    assert.match(text, /115 cobranças/);
    // Fechado: as ocorrências só aparecem ao expandir.
    assert.doesNotMatch(text, /73996779726/);

    const loanButton = view.container.querySelector("button");
    assert.ok(loanButton);
    act(() => {
      loanButton.click();
    });
    const expanded = view.container.textContent ?? "";
    assert.match(expanded, /2028/);
    assert.match(expanded, /23\/10\/2026/);
    assert.match(expanded, /73996779726/);
    assert.match(expanded, /2026-11/);
    assert.match(expanded, /fecha 04\/11\/2026/);
    assert.equal(loanButton.getAttribute("aria-expanded"), "true");

    const difalButton = view.container.querySelectorAll("button")[1];
    act(() => {
      difalButton?.click();
    });
    assert.match(view.container.textContent ?? "", /Mostrando 1 de 115 cobranças/);
    assert.equal(loanButton.getAttribute("aria-expanded"), "false");
    view.unmount();
  });
});
