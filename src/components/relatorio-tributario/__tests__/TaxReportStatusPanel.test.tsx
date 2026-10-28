import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { act, renderIntoDocument } from "@/test-setup/render";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  TaxMonthKpi,
  TaxReportDreLine,
  TaxReportStatusBanner,
  dreFollowUpMessage,
} from "@/components/relatorio-tributario/TaxReportStatusPanel";
import { TaxRecalcConfirmDialog } from "@/components/relatorio-tributario/TaxRecalcConfirmDialog";
import type {
  TaxReportPayload,
  TaxReportScreenStatus,
} from "@/lib/tax-report/types";

function report(tax: number, revenue: number): TaxReportPayload {
  return {
    year: 2026,
    month: 9,
    consolidado: {
      faturamento: revenue,
      pisCofinsLiquido: 0,
      icmsDifalTotal: 0,
      impostoOperacionalTotal: tax,
      cbsIbsInformativoTotal: 0,
      margemOperacional: 0,
      transacoesIncluidas: 0,
      transacoesExcluidas: 0,
      transacoesSemBillingInfo: 0,
    },
    porSku: [],
    overrides: {},
    meta: {
      geradoEm: "2026-10-02T10:00:00.000Z",
      pedidosProcessados: 10,
      linhasProcessadas: 10,
      semBillingInfo: 0,
      duracaoMs: 0,
      taxRegime: "LUCRO_REAL",
      originUf: "SP",
    },
  };
}

function status(overrides: Partial<TaxReportScreenStatus> = {}): TaxReportScreenStatus {
  return {
    saved: { tax: 900, revenue: 10_000, generatedAt: "2026-10-02T10:00:00.000Z" },
    unsavedRecalc: false,
    staleness: {
      completeness: "closed",
      reasons: [],
      monthCloseIso: "2026-10-01T03:00:00.000Z",
      ordersFetchedAtIso: "2026-10-02T10:00:00.000Z",
    },
    dre: null,
    ...overrides,
  };
}

const buttonByText = (root: ParentNode, pattern: RegExp) =>
  [...root.querySelectorAll("button")].find((b) => pattern.test(b.textContent ?? ""));

describe("TaxMonthKpi", () => {
  it("shows the month's tax and its revenue-weighted share", () => {
    const view = renderIntoDocument(
      <TooltipProvider>
        <TaxMonthKpi report={report(639, 10_000)} />
      </TooltipProvider>,
    );
    assert.match(view.container.textContent ?? "", /R\$\s?639,00/);
    assert.match(view.container.textContent ?? "", /6,39% do faturamento/);
    view.unmount();
  });
});

describe("TaxReportStatusBanner", () => {
  it("asks to recalculate (fetching orders) a closed month fetched before it closed", () => {
    let regenerated = 0;
    const view = renderIntoDocument(
      <TaxReportStatusBanner
        status={status({
          staleness: {
            completeness: "incomplete",
            reasons: ["incomplete"],
            monthCloseIso: "2026-10-01T03:00:00.000Z",
            ordersFetchedAtIso: "2026-09-10T03:56:00.000Z",
          },
        })}
        report={report(900, 10_000)}
        monthLabel="setembro"
        busy={false}
        onRecompute={() => {}}
        onRegenerate={() => (regenerated += 1)}
      />,
    );
    assert.match(view.container.textContent ?? "", /buscados em 10\/09, antes do fechamento do mês \(30\/09\)/);
    act(() => buttonByText(view.container, /Recalcular/)!.click());
    assert.equal(regenerated, 1);
    view.unmount();
  });

  it("shows the screen recalculation against the saved version the DRE uses", () => {
    let recomputed = 0;
    const view = renderIntoDocument(
      <TaxReportStatusBanner
        status={status({ unsavedRecalc: true })}
        report={report(700, 10_000)}
        monthLabel="junho"
        busy={false}
        onRecompute={() => (recomputed += 1)}
        onRegenerate={() => {}}
      />,
    );
    assert.match(view.container.textContent ?? "", /7,00%.*9,00%/);
    act(() => buttonByText(view.container, /Salvar recálculo/)!.click());
    assert.equal(recomputed, 1);
    view.unmount();
  });

  it("offers the quick update for a legacy report and renders nothing when up to date", () => {
    const legacy = renderIntoDocument(
      <TaxReportStatusBanner
        status={status({
          staleness: { ...status().staleness, reasons: ["legacy"] },
        })}
        report={report(900, 10_000)}
        monthLabel="julho"
        busy={false}
        onRecompute={() => {}}
        onRegenerate={() => {}}
      />,
    );
    assert.ok(buttonByText(legacy.container, /Atualizar cálculo/));
    legacy.unmount();

    const clean = renderIntoDocument(
      <TaxReportStatusBanner
        status={status()}
        report={report(900, 10_000)}
        monthLabel="julho"
        busy={false}
        onRecompute={() => {}}
        onRegenerate={() => {}}
      />,
    );
    assert.equal(clean.container.textContent, "");
    clean.unmount();
  });
});

describe("TaxReportDreLine", () => {
  it("confirms when the DRE uses this version, and offers the update when it does not", () => {
    const uses = renderIntoDocument(
      <TaxReportDreLine
        status={status({ dre: { usesThisVersion: true, taxErp: -900, manualEdit: false } })}
        monthLabel="setembro"
        busy={false}
        onRefreshDre={() => {}}
      />,
    );
    assert.match(uses.container.textContent ?? "", /DRE de setembro usa esta versão/);
    uses.unmount();

    let refreshed = 0;
    const old = renderIntoDocument(
      <TaxReportDreLine
        status={status({ dre: { usesThisVersion: false, taxErp: -700, manualEdit: false } })}
        monthLabel="setembro"
        busy={false}
        onRefreshDre={() => (refreshed += 1)}
      />,
    );
    act(() => buttonByText(old.container, /Atualizar imposto no DRE/)!.click());
    assert.equal(refreshed, 1);
    old.unmount();
  });
});

describe("dreFollowUpMessage", () => {
  it("reports before → after when the DRE tax followed the report", () => {
    const message = dreFollowUpMessage(
      { status: "updated", previousTaxErp: -10856.62, taxErp: -8207.72 },
      "julho",
    );
    assert.equal(message?.tone, "success");
    assert.match(message!.text, /julho atualizado/);
  });

  it("stays quiet when there is no DRE for the month", () => {
    assert.equal(
      dreFollowUpMessage({ status: "no_snapshot", previousTaxErp: null, taxErp: null }, "julho"),
      null,
    );
  });
});

describe("TaxRecalcConfirmDialog", () => {
  it("shows before → after for the report and the DRE before confirming", () => {
    let confirmed = 0;
    const view = renderIntoDocument(
      <TaxRecalcConfirmDialog
        open
        kind="recompute"
        loading={false}
        confirming={false}
        months={[
          {
            month: 7,
            label: "jul/2026",
            report: {
              before: { tax: 10843.38, revenue: 145250.68 },
              after: { tax: 8210.51, revenue: 145250.68 },
            },
            dre: { status: "updated", previousTaxErp: -10856.62, taxErp: -8207.72 },
          },
        ]}
        onConfirm={() => (confirmed += 1)}
        onCancel={() => {}}
      />,
    );
    const text = document.body.textContent ?? "";
    assert.match(text, /7,47%.*5,65%/);
    assert.match(text, /Impostos sobre vendas no DRE/);
    act(() => buttonByText(document.body, /^Atualizar cálculo$/)!.click());
    assert.equal(confirmed, 1);
    view.unmount();
  });
});
