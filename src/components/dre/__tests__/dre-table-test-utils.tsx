import assert from "node:assert/strict";
import { act } from "@/test-setup/render";
import { DreYearTable } from "@/components/dre/DreYearTable";
import { DreRecalcProvider, type DreRecalc } from "@/components/dre/dre-recalc";
import type {
  DreEditableLineKey,
  DreLineAmounts,
} from "@/lib/dre/dre-calculations";
import type { DreYearView } from "@/lib/dre/dre-year-data";

/** Fixture e helpers dos testes DOM da tabela do DRE (não é um teste). */

export const TOTALS = {
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

const JANUARY_LINES: DreLineAmounts = {
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
};

/** Mesmo formato do fixture de `dre-export-csv.test.ts`; só janeiro tem números. */
export function yearView(january: Partial<DreLineAmounts> = {}): DreYearView {
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
      lines: i === 0 ? { ...JANUARY_LINES, ...january } : null,
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

export const noop = () => {};

export type LineChange = (
  lineKey: DreEditableLineKey,
  month: number,
  amount: number,
) => void;

/** Tabela no Demonstrativo de janeiro, com o provider de recálculo. */
export function dreTable({
  data,
  recalc = null,
  onLineChange = noop,
}: {
  data: DreYearView;
  recalc?: DreRecalc | null;
  onLineChange?: LineChange;
}) {
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

export const text = (node: Element) =>
  (node.textContent ?? "").replace(/\s/g, " ");

/** Valor editável (o `span` com duplo-clique) de uma linha. */
export function editableValue(container: ParentNode, label: string): HTMLElement {
  const node = [
    ...container.querySelectorAll<HTMLElement>('span[role="button"]'),
  ].find((span) => (span.getAttribute("title") ?? "").includes(`editar ${label}`));
  assert.ok(node, `valor editável de ${label}`);
  return node;
}

export async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

/** Duplo-clique na célula e espera o painel do editor abrir. */
export async function openEditor(
  container: ParentNode,
  label: string,
): Promise<HTMLInputElement> {
  await act(async () => {
    editableValue(container, label).dispatchEvent(
      new MouseEvent("dblclick", { bubbles: true }),
    );
  });
  await flush();
  const input = document.querySelector<HTMLInputElement>(
    `input[aria-label="Editar ${label}"]`,
  );
  assert.ok(input, `editor de ${label} aberto`);
  return input;
}

export async function typeValue(input: HTMLInputElement, typed: string) {
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  await act(async () => {
    setValue.call(input, typed);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

export async function pressKey(input: HTMLInputElement, key: string) {
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}
