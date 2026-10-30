import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { act, renderIntoDocument } from "@/test-setup/render";
import { DreYearTable } from "@/components/dre/DreYearTable";
import {
  dreRecalcLineKey,
  DreRecalcProvider,
  type DreRecalc,
} from "@/components/dre/dre-recalc";
import type { DreEditableLineKey } from "@/lib/dre/dre-calculations";
import type { DreYearView } from "@/lib/dre/dre-year-data";

const TOTALS = {
  totalEntrada: 1000,
  totalCustoOperacional: -740,
  margemContribuicao: 260,
  margemContribuicaoPercent: 26,
  totalCustoFixoManual: 0,
  totalCustoOperacionalManual: 0,
  totalInvestimentoManual: 0,
  adsCost: 30,
  totalCustoFixo: 0,
  totalInvestimento: 0,
  lucroOperacionalAntesInvestimentos: 260,
  lucroOperacionalAntesInvestimentosPercent: 26,
  lucroOperacional: 260,
  lucroOperacionalPercent: 26,
  totalSaidaNaoOperacionalManual: 0,
  totalSaidaNaoOperacional: 0,
  totalEntradaNaoOperacionalManual: 0,
  totalEntradaNaoOperacional: 0,
  resultadoLiquido: 260,
  resultadoLiquidoPercent: 26,
};

/** Mesmo formato do fixture de `dre-export-csv.test.ts`; só janeiro tem números. */
function yearView(): DreYearView {
  return {
    year: 2026,
    costItems: [],
    operationalCostItems: [],
    investmentCostItems: [],
    nonOperationalOutItems: [],
    nonOperationalInItems: [],
    months: Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      label: `Mês ${i + 1}`,
      isCurrentMonth: false,
      isFutureMonth: false,
      canSync: true,
      syncedAt: null,
      billingSource: null,
      isPartial: false,
      incompleteProductCostCount: 0,
      syncWarnings: [],
      lines:
        i === 0
          ? {
              revenueMl: 1000,
              cancelledSalesMl: -50,
              saleFeeMl: -100,
              partialReturnsMl: -10,
              returnFeeMl: 0,
              specialFeesMl: 0,
              productCostErp: -400,
              taxErp: -80,
              sellerShippingMl: -70,
              fullShippingMl: 0,
              fullStorageMl: 0,
              fullNonComplianceMl: 0,
              minhaPaginaMl: 0,
              affiliateFeeMl: 0,
            }
          : null,
      cancelledIncludeOverlay: null,
      productCostBreakdown: null,
      taxBreakdown: null,
      revenueBreakdown: null,
      cancelledSalesBreakdown: null,
      saleFeeBreakdown: null,
      sellerShippingBreakdown: null,
      adsCostBreakdown: null,
      partialReturnsBreakdown: null,
      returnFeeBreakdown: null,
      specialFeesBreakdown: null,
      fullShippingBreakdown: null,
      fullStorageBreakdown: null,
      fullNonComplianceBreakdown: null,
      minhaPaginaBreakdown: null,
      affiliateFeeBreakdown: null,
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
      fullReportSourced: false,
      adsCost: i === 0 ? 30 : null,
      manuallyEditedLineKeys: [],
      syncedLineBaselineKeys: [],
      fixedCostValues: {},
      fixedCostOverrides: {},
      operationalCostValues: {},
      operationalCostOverrides: {},
      investmentCostValues: {},
      investmentCostOverrides: {},
      nonOperationalOutValues: {},
      nonOperationalOutOverrides: {},
      nonOperationalInValues: {},
      nonOperationalInOverrides: {},
      totals: i === 0 ? TOTALS : null,
    })),
    yearTotals: TOTALS,
  };
}

const noop = () => {};
const data = yearView();

function tree(
  recalc: DreRecalc | null,
  onLineChange: (lineKey: DreEditableLineKey, month: number, amount: number) => void,
) {
  return (
    <DreRecalcProvider value={recalc}>
      <DreYearTable
        data={data}
        showDetails
        selectedMonth={1}
        onSelectedMonthChange={noop}
        syncingMonths={new Set()}
        onSyncMonth={noop}
        onLineChange={onLineChange}
        onFixedCostChange={noop}
        onOperationalCostChange={noop}
        onInvestmentCostChange={noop}
        onNonOperationalOutChange={noop}
        onNonOperationalInChange={noop}
      />
    </DreRecalcProvider>
  );
}

const text = (node: Element) => (node.textContent ?? "").replace(/\s/g, " ");

/** Valor editável do Demonstrativo (o `span` com duplo-clique). */
function editableValue(container: ParentNode, label: string): HTMLElement {
  const node = [...container.querySelectorAll<HTMLElement>('span[role="button"]')].find(
    (span) => (span.getAttribute("title") ?? "").includes(`editar ${label}`),
  );
  assert.ok(node, `valor editável de ${label}`);
  return node;
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

async function typeAndApply(label: string, typed: string) {
  const input = document.querySelector<HTMLInputElement>(
    `input[aria-label="Editar ${label}"]`,
  );
  assert.ok(input, `editor de ${label} aberto`);
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  await act(async () => {
    setValue.call(input, typed);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
}

describe("DreYearTable — recálculo depois de uma edição manual", () => {
  it("mostra o valor novo na célula editada, borra o resto do mês e volta no erro", async () => {
    const calls: [DreEditableLineKey, number, number][] = [];
    const onLineChange = (lineKey: DreEditableLineKey, month: number, amount: number) => {
      calls.push([lineKey, month, amount]);
    };
    const view = renderIntoDocument(tree(null, onLineChange));
    const revenueLabel = "Faturamento ML (Mês 1)";

    assert.equal(document.querySelectorAll('[aria-busy="true"]').length, 0);

    await act(async () => {
      editableValue(view.container, revenueLabel).dispatchEvent(
        new MouseEvent("dblclick", { bubbles: true }),
      );
    });
    await flush();
    await typeAndApply(revenueLabel, "R$ 1.500,00");
    assert.deepEqual(calls, [["revenueMl", 1, 1500]]);

    // O pai (DreClient) marca o mês como recalculando até o ano voltar.
    view.rerender(
      tree({ month: 1, editedKey: dreRecalcLineKey("revenueMl") }, onLineChange),
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
    view.rerender(tree(null, onLineChange));
    assert.equal(text(editableValue(view.container, revenueLabel)), "R$ 1.000,00");
    assert.equal(document.querySelectorAll('[aria-busy="true"]').length, 0);
    assert.equal(view.container.querySelector('[role="status"]'), null);
    view.unmount();
  });

  it("na visão Comparar meses borra só a coluna do mês editado", async () => {
    const view = renderIntoDocument(tree(null, noop));
    const yearToggle = [...view.container.querySelectorAll("button")].find((button) =>
      text(button).includes("Comparar meses"),
    );
    assert.ok(yearToggle);
    await act(async () => {
      yearToggle.click();
    });

    view.rerender(tree({ month: 1, editedKey: null }, noop));
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
