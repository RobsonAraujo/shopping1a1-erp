import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { act, renderIntoDocument } from "@/test-setup/render";
import {
  MonthTaxStatusLine,
  MonthZeroAnomalyLine,
  cellIssueFor,
  getMonthAlertMessages,
  lineAuditNote,
  monthTaxStatusMessage,
} from "@/components/dre/DreYearTableShared";
import type { DreMonthView, DreMonthTaxStatus } from "@/lib/dre/dre-year-data";

/** Só os campos que estas funções leem (o resto do `DreMonthView` é ruído). */
function month(overrides: Partial<DreMonthView> = {}): DreMonthView {
  return {
    month: 9,
    label: "set.",
    canSync: true,
    isPartial: false,
    billingSource: null,
    syncedAt: "2026-10-02T00:00:00.000Z",
    syncWarnings: [],
    reconciliation: {
      status: "none",
      reconciledAt: null,
      fileName: null,
      lineKeys: [],
      reviewImportId: null,
    },
    levelingChangedAfterSync: false,
    taxStatus: null,
    taxSource: null,
    zeroLineAnomalies: [],
    keptFromPrevious: null,
    lineAuditMismatches: [],
    ...overrides,
  } as DreMonthView;
}

const report = {
  generatedAt: "2026-09-10T03:56:00.000Z",
  ordersFetchedAt: "2026-09-10T03:56:00.000Z",
  legacy: false,
};

function status(overrides: Partial<DreMonthTaxStatus>): DreMonthTaxStatus {
  return { kind: "ok", report, reasons: [], canRefresh: true, ...overrides };
}

describe("monthTaxStatusMessage", () => {
  it("asks to recalculate a closed month whose tax report was fetched before it closed", () => {
    const message = monthTaxStatusMessage(
      month({ taxStatus: status({ kind: "report_outdated", reasons: ["incomplete"] }) }),
      2026,
    );
    assert.equal(message?.action, "regenerate_report");
    assert.match(message!.text, /10\/09, antes do fechamento do mês \(30\/09\)/);
  });

  it("has no action when the report covers the closed month or the month is in progress", () => {
    assert.equal(monthTaxStatusMessage(month({ taxStatus: status({ kind: "ok" }) }), 2026)?.action, null);
    assert.equal(monthTaxStatusMessage(month({ taxStatus: status({ kind: "partial" }) }), 2026)?.action, null);
  });

  it("offers the right fix for each state", () => {
    assert.equal(
      monthTaxStatusMessage(month({ taxStatus: status({ kind: "dre_outdated" }) }), 2026)?.action,
      "refresh",
    );
    assert.equal(
      monthTaxStatusMessage(
        month({ taxStatus: status({ kind: "dre_outdated", canRefresh: false }) }),
        2026,
      )?.action,
      "sync",
    );
    assert.equal(
      monthTaxStatusMessage(month({ taxStatus: status({ kind: "report_missing", report: null }) }), 2026)?.action,
      "regenerate_report",
    );
    assert.equal(
      monthTaxStatusMessage(
        month({ taxStatus: status({ kind: "report_outdated", reasons: ["legacy"] }) }),
        2026,
      )?.action,
      "recompute_report",
    );
  });
});

describe("MonthTaxStatusLine", () => {
  it("renders the fix as a button and reports the action", () => {
    const calls: Array<[number, string]> = [];
    const view = renderIntoDocument(
      <MonthTaxStatusLine
        month={month({ taxStatus: status({ kind: "report_outdated", reasons: ["incomplete"] }) })}
        year={2026}
        busy={false}
        onTaxAction={(m, action) => calls.push([m, action])}
      />,
    );
    const button = [...view.container.querySelectorAll("button")].find((b) =>
      /Recalcular tributário/.test(b.textContent ?? ""),
    );
    assert.ok(button, "expected the recalculate button");
    act(() => button!.click());
    assert.deepEqual(calls, [[9, "regenerate_report"]]);
    view.unmount();
  });

  it("is a quiet line (no button) when the tax is up to date", () => {
    const view = renderIntoDocument(
      <MonthTaxStatusLine
        month={month({
          taxStatus: status({
            kind: "ok",
            report: { ...report, generatedAt: "2026-10-02T12:00:00.000Z" },
          }),
        })}
        year={2026}
        busy={false}
        onTaxAction={() => {}}
      />,
    );
    assert.equal(view.container.querySelector("button"), null);
    assert.match(view.container.textContent ?? "", /tributário de 02\/10 ✓/);
    view.unmount();
  });
});

describe("MonthZeroAnomalyLine", () => {
  it("names the zeroed line, its usual share and offers to sync again", () => {
    const resynced: number[] = [];
    const view = renderIntoDocument(
      <MonthZeroAnomalyLine
        month={month({
          zeroLineAnomalies: [
            { lineKey: "cancelledSalesMl", typicalPercent: 5.3, expectedAmount: 8000 },
          ],
        })}
        busy={false}
        onResync={(m) => resynced.push(m)}
      />,
    );
    assert.match(view.container.textContent ?? "", /Canceladas \/ devolvidas veio zerada/);
    assert.match(view.container.textContent ?? "", /≈5,30%/);
    const button = view.container.querySelector("button");
    act(() => button!.click());
    assert.deepEqual(resynced, [9]);
    view.unmount();
  });
});

describe("cellIssueFor / lineAuditNote / avisos", () => {
  it("marks the tax cell when it needs action and a zeroed line as action", () => {
    const m = month({
      taxStatus: status({ kind: "report_missing", report: null }),
      zeroLineAnomalies: [
        { lineKey: "saleFeeMl", typicalPercent: 12, expectedAmount: 12000 },
      ],
    });
    assert.equal(cellIssueFor(m, "taxErp", 2026)?.tone, "action");
    assert.equal(cellIssueFor(m, "saleFeeMl", 2026)?.tone, "action");
    assert.equal(cellIssueFor(m, "revenueMl", 2026), null);
  });

  it("marks a kept value as muted audit information", () => {
    const m = month({
      keptFromPrevious: { lineKeys: ["adsCost"], syncedAt: "2026-07-05T15:00:00.000Z" },
    });
    const issue = cellIssueFor(m, "adsCost", 2026);
    assert.equal(issue?.tone, "muted");
    assert.match(issue!.text, /05\/07/);
    assert.match(lineAuditNote(m, "adsCost") ?? "", /mantidos do sync de 05\/07/);
    assert.ok(
      getMonthAlertMessages(m).some((text) => /Campanhas ADS mantiveram/.test(text)),
    );
  });

  it("explains a line that does not match its audit list", () => {
    const m = month({
      lineAuditMismatches: [
        { lineKey: "cancelledSalesMl", value: 0, auditSum: -1500, kind: "zero_with_audit" },
      ],
    });
    assert.match(lineAuditNote(m, "cancelledSalesMl") ?? "", /zerada.*sincronize/);
    assert.ok(
      getMonthAlertMessages(m).some((text) => /Canceladas \/ devolvidas: a linha mostra/.test(text)),
    );
  });
});
