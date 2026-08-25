import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDreYearCsv } from "../dre-export-csv";
import type { DreYearView } from "../dre-year-data";

function emptyYear(): DreYearView {
  return {
    year: 2026,
    costItems: [],
    operationalCostItems: [],
    investmentCostItems: [],
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
      pendingReconciliationImportId: null,
      pendingReconciliationApplied: false,
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
      totals: null,
    })),
    yearTotals: {
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
    },
  };
}

describe("buildDreYearCsv", () => {
  it("includes BOM, month headers and partial returns row", () => {
    const csv = buildDreYearCsv(emptyYear(), true);
    assert.ok(csv.startsWith("\uFEFF"));
    assert.match(csv, /Linha;JAN;FEV/);
    assert.match(csv, /Devoluções parciais/);
    assert.match(csv, /Faturamento ML;1000,00/);
  });
});
