import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyDreIncludeCancelledView,
  applyManualLineEdit,
  applyRestoreLineFromSync,
  breakdownIdentityKey,
  buildSyncedLineBaseline,
  captureSyncedBreakdowns,
  commitReconciledLinesAsTruth,
  computeDreTotals,
  getEditableLineAmount,
  getYearLineBreakdown,
  getYearProductCostBreakdown,
  getYearTaxBreakdown,
  isDreEditableLineKey,
  mergeLineBreakdowns,
  mergePreservedManualLines,
  mergeProductCostBreakdowns,
  mergeTaxBreakdowns,
  normalizeProductCostAuditMergeKey,
  percentOfRevenue,
  productCostAuditKey,
  sumYearLineAmounts,
  withSyncLineBaseline,
  type DreLineBreakdownItem,
  type DreMonthSnapshotPayload,
  type DreProductCostBreakdownItem,
  type DreTaxBreakdownItem,
} from "../dre-calculations";
import { mapBillingSummaryToDreLines } from "../../mercadolibre/billing-summary";

const BASE_LINES = {
  revenueMl: 0,
  cancelledSalesMl: 0,
  saleFeeMl: 0,
  partialReturnsMl: 0,
  returnFeeMl: 0,
  specialFeesMl: 0,
  productCostErp: 0,
  taxErp: 0,
  sellerShippingMl: 0,
  fullShippingMl: 0,
  fullStorageMl: 0,
  fullNonComplianceMl: 0,
  minhaPaginaMl: 0,
  affiliateFeeMl: 0,
};

function emptyPayload(
  overrides: Partial<DreMonthSnapshotPayload> = {},
): DreMonthSnapshotPayload {
  return {
    ...BASE_LINES,
    adsCost: 0,
    billingSource: "billing",
    isPartial: false,
    incompleteProductCostCount: 0,
    syncWarnings: [],
    ...overrides,
  };
}

describe("computeDreTotals", () => {
  it("includes ADS in custos variáveis (before margem de contribuição)", () => {
    const totals = computeDreTotals(
      {
        revenueMl: 63160.3,
        cancelledSalesMl: -2034.7,
        saleFeeMl: -7191.93,
        partialReturnsMl: 0,
        returnFeeMl: 0,
        specialFeesMl: 0,
        productCostErp: -30091.31,
        taxErp: -11395.19,
        sellerShippingMl: -8930.39,
        fullShippingMl: -500,
        fullStorageMl: -200,
        fullNonComplianceMl: -50,
        minhaPaginaMl: 0,
        affiliateFeeMl: 0,
      },
      4400,
      [{ costItemId: "rent", amount: 3000 }],
      [{ costItemId: "pack", amount: 150 }],
    );

    assert.equal(totals.totalEntrada, 63160.3);
    assert.ok(totals.totalCustoOperacional < 0);
    // ADS agora é descontado dentro de Custos Variáveis, então a Margem de
    // Contribuição cai em relação ao valor antigo (que só descontava ADS depois).
    assert.equal(totals.margemContribuicao, -1783.22);
    // Custo fixo não inclui mais ADS.
    assert.equal(totals.totalCustoFixo, -3000);
    assert.equal(totals.lucroOperacionalAntesInvestimentos, -4783.22);
    // Sem itens de investimento cadastrados, Lucro Operacional == Lucro
    // Operacional Antes dos Investimentos (mesmo valor que era "lucro líquido").
    assert.equal(totals.totalInvestimento, -0);
    assert.equal(totals.lucroOperacional, -4783.22);
  });

  it("subtracts investment items after lucro operacional antes dos investimentos", () => {
    const totals = computeDreTotals(
      {
        ...BASE_LINES,
        revenueMl: 10000,
      },
      0,
      [{ costItemId: "rent", amount: 1000 }],
      [],
      [{ costItemId: "marketing-institucional", amount: 500 }],
    );

    assert.equal(totals.lucroOperacionalAntesInvestimentos, 9000);
    assert.equal(totals.totalInvestimentoManual, 500);
    assert.equal(totals.totalInvestimento, -500);
    assert.equal(totals.lucroOperacional, 8500);
  });

  it("subtracts non-operational outflows and adds non-operational inflows after lucro operacional", () => {
    const totals = computeDreTotals(
      {
        ...BASE_LINES,
        revenueMl: 10000,
      },
      0,
      [{ costItemId: "rent", amount: 1000 }],
      [],
      [{ costItemId: "marketing-institucional", amount: 500 }],
      [{ costItemId: "multa", amount: 200 }],
      [{ costItemId: "venda-imobilizado", amount: 700 }],
    );

    assert.equal(totals.lucroOperacional, 8500);
    // Saída não operacional subtrai, como as outras categorias manuais.
    assert.equal(totals.totalSaidaNaoOperacionalManual, 200);
    assert.equal(totals.totalSaidaNaoOperacional, -200);
    // Entrada não operacional SOMA — é a única categoria manual positiva.
    assert.equal(totals.totalEntradaNaoOperacionalManual, 700);
    assert.equal(totals.totalEntradaNaoOperacional, 700);
    assert.equal(totals.resultadoLiquido, 8500 - 200 + 700);
    assert.equal(
      totals.resultadoLiquidoPercent,
      percentOfRevenue(totals.resultadoLiquido, 10000),
    );
  });

  it("negative amounts in non-operational cost inputs are ignored (never flip the sign)", () => {
    const totals = computeDreTotals(
      { ...BASE_LINES, revenueMl: 10000 },
      0,
      [],
      [],
      [],
      [{ costItemId: "multa", amount: -50 }],
      [{ costItemId: "venda-imobilizado", amount: -50 }],
    );
    assert.equal(totals.totalSaidaNaoOperacional, -0);
    assert.equal(totals.totalEntradaNaoOperacional, 0);
    assert.equal(totals.resultadoLiquido, totals.lucroOperacional);
  });

  it("returns null percent when revenue is zero", () => {
    assert.equal(percentOfRevenue(100, 0), null);
  });
});

describe("sumYearLineAmounts", () => {
  it("sums months", () => {
    const sum = sumYearLineAmounts([
      {
        ...BASE_LINES,
        revenueMl: 100,
        cancelledSalesMl: -10,
        saleFeeMl: -5,
        sellerShippingMl: -7,
      },
      {
        ...BASE_LINES,
        revenueMl: 200,
        cancelledSalesMl: -20,
        saleFeeMl: -10,
        sellerShippingMl: -14,
      },
    ]);
    assert.equal(sum.revenueMl, 300);
    assert.equal(sum.saleFeeMl, -15);
  });
});

describe("applyDreIncludeCancelledView", () => {
  it("moves cancelled revenue into entrada and keeps cancelled line as custo variável, without touching product cost or tax", () => {
    const lines = {
      ...BASE_LINES,
      revenueMl: 1000,
      cancelledSalesMl: -150,
      productCostErp: -400,
      taxErp: -100,
    };
    const adjusted = applyDreIncludeCancelledView(lines, {
      revenueGross: 150,
      productCostErp: -50,
      taxErp: -15,
    });
    assert.equal(adjusted.revenueMl, 1150);
    assert.equal(adjusted.cancelledSalesMl, -150);
    // Custo produto e Imposto ML de pedidos cancelados já foram excluídos do
    // cálculo base — não há custo/imposto a somar de volta aqui.
    assert.equal(adjusted.productCostErp, -400);
    assert.equal(adjusted.taxErp, -100);
  });

  it("falls back to cancelled line when overlay is missing", () => {
    const lines = {
      ...BASE_LINES,
      revenueMl: 500,
      cancelledSalesMl: -80,
    };
    const adjusted = applyDreIncludeCancelledView(lines);
    assert.equal(adjusted.revenueMl, 580);
    assert.equal(adjusted.cancelledSalesMl, -80);
  });
});

describe("mapBillingSummaryToDreLines", () => {
  it("maps ML billing charges from bill_includes using official types", () => {
    const mapped = mapBillingSummaryToDreLines({
      payment_collected: { operation_discount: 73348.45 },
      bill_includes: {
        charges: [
          { label: "Cargo por venta", amount: 19297.83, type: "CV" },
          { label: "Cargo por Mercado Envíos", amount: 192.02, type: "CXD" },
          { label: "Vendas canceladas", amount: 3614.1, type: "CXC" },
          { label: "Full - Envios", amount: 2805.25, type: "CXD" },
          { label: "Full - Armazenamento", amount: 120.5, type: "CXD" },
          { label: "Full - Inconformidades", amount: 35.0, type: "CXD" },
          { label: "Campañas de publicidad - Product Ads", amount: 2127.15, type: "PADS" },
        ],
        bonuses: [{ label: "Devolução parcial", amount: 25.41, type: "BXD" }],
      },
    });

    assert.equal(mapped.revenueMl, 73348.45);
    assert.equal(mapped.saleFee, -19297.83);
    assert.equal(mapped.sellerShipping, -192.02);
    assert.equal(mapped.cancelledSales, -3614.1);
    assert.equal(mapped.partialReturns, 25.41);
    assert.equal(mapped.fullShipping, -2805.25);
    assert.equal(mapped.fullStorage, -120.5);
    assert.equal(mapped.fullNonCompliance, -35);
    assert.equal(mapped.adsCost, 2127.15);
  });

  it("maps legacy flat charges array for backward compatibility", () => {
    const mapped = mapBillingSummaryToDreLines({
      charges: [
        { label: "Tarifa por vender", amount: 7191.93, type: "CV" },
        { label: "Frete vendedor", amount: 8930.39, type: "CXD" },
        { label: "Vendas canceladas", amount: 2034.7 },
      ],
      bonuses: [{ label: "Devolução parcial", amount: 120 }],
    });

    assert.equal(mapped.saleFee, -7191.93);
    assert.equal(mapped.sellerShipping, -8930.39);
    assert.equal(mapped.cancelledSales, -2034.7);
    assert.equal(mapped.partialReturns, 120);
  });

  it("maps CESM and CVAF into dedicated DRE lines (not saleFee)", () => {
    const mapped = mapBillingSummaryToDreLines({
      bill_includes: {
        charges: [
          { label: "Tarifa de venda", amount: 100, type: "CV" },
          { label: "CVAF", amount: 93.73, type: "CVAF" },
          {
            label: "Tarifa de manutenção do eShop",
            amount: 99,
            type: "CESM",
          },
          {
            label: "Campanhas de publicidade - Product Ads",
            amount: 50,
            type: "PADS",
          },
        ],
        bonuses: [],
      },
    });

    assert.equal(mapped.saleFee, -100);
    assert.equal(mapped.affiliateFee, -93.73);
    assert.equal(mapped.minhaPagina, -99);
    assert.equal(mapped.adsCost, 50);
  });
});

describe("manual line edit / restore from sync", () => {
  it("marks edited keys and keeps sync baseline", () => {
    const synced = withSyncLineBaseline(
      emptyPayload({ revenueMl: 1000, saleFeeMl: -100 }),
    );
    assert.equal(synced.manuallyEditedLineKeys?.length, 0);
    assert.equal(synced.syncedLineBaseline?.revenueMl, 1000);

    const edited = applyManualLineEdit(synced, "revenueMl", 1100);
    assert.deepEqual(edited.manuallyEditedLineKeys, ["revenueMl"]);
    assert.equal(edited.revenueMl, 1100);
    assert.equal(edited.syncedLineBaseline?.revenueMl, 1000);
  });

  it("clears the adjusted mark when value returns to baseline", () => {
    const synced = withSyncLineBaseline(emptyPayload({ revenueMl: 1000 }));
    const edited = applyManualLineEdit(synced, "revenueMl", 1100);
    const back = applyManualLineEdit(edited, "revenueMl", 1000);
    assert.deepEqual(back.manuallyEditedLineKeys, []);
    assert.equal(back.revenueMl, 1000);
  });

  it("restores from sync baseline", () => {
    const synced = withSyncLineBaseline(
      emptyPayload({
        saleFeeMl: -80,
        saleFeeBreakdown: [
          {
            key: "api",
            sku: null,
            title: "Tarifa ML",
            quantity: null,
            amount: -80,
          },
        ],
      }),
    );
    const edited = applyManualLineEdit(synced, "saleFeeMl", -50);
    const withReconAudit = {
      ...edited,
      saleFeeBreakdown: [
        {
          key: "xlsx",
          sku: null,
          title: "Planilha",
          quantity: 1,
          amount: -50,
        },
      ],
    };
    const restored = applyRestoreLineFromSync(withReconAudit, "saleFeeMl");
    assert.ok(restored);
    assert.equal(restored.saleFeeMl, -80);
    assert.deepEqual(restored.manuallyEditedLineKeys, []);
    assert.equal(restored.saleFeeBreakdown?.[0]?.title, "Tarifa ML");
    assert.equal(restored.saleFeeBreakdown?.[0]?.amount, -80);
  });

  it("returns null when restoring without baseline", () => {
    const payload = emptyPayload({ revenueMl: 500 });
    assert.equal(applyRestoreLineFromSync(payload, "revenueMl"), null);
  });

  it("does not mark hasRealSyncBaseline when editing a never-synced snapshot", () => {
    // Simula `emptyDreMonthSnapshotPayload()` (mês futuro/sem sync ainda):
    // não tem `syncedLineBaseline`/`hasRealSyncBaseline`.
    const neverSynced = emptyPayload({ revenueMl: 0 });
    const edited = applyManualLineEdit(neverSynced, "revenueMl", 500);
    // `applyManualLineEdit` semeia um baseline "fantasma" (valor pré-edição)
    // pra saber se a linha difere dele, mas isso não é um sync real.
    assert.equal(edited.syncedLineBaseline?.revenueMl, 0);
    assert.notEqual(edited.hasRealSyncBaseline, true);
  });
});

describe("mergePreservedManualLines", () => {
  it("keeps selected manual values and refreshes baseline from sync", () => {
    const previous = applyManualLineEdit(
      withSyncLineBaseline(emptyPayload({ revenueMl: 1000, saleFeeMl: -100 })),
      "revenueMl",
      1200,
    );
    const previousBoth = applyManualLineEdit(previous, "saleFeeMl", -40);
    const fresh = emptyPayload({ revenueMl: 1500, saleFeeMl: -110 });

    const merged = mergePreservedManualLines(fresh, previousBoth, [
      "revenueMl",
    ]);

    assert.equal(merged.revenueMl, 1200);
    assert.equal(merged.saleFeeMl, -110);
    assert.equal(merged.syncedLineBaseline?.revenueMl, 1500);
    assert.equal(merged.syncedLineBaseline?.saleFeeMl, -110);
    assert.deepEqual(merged.manuallyEditedLineKeys, ["revenueMl"]);
  });

  it("clears all manual marks when preserveKeys is empty", () => {
    const previous = applyManualLineEdit(
      withSyncLineBaseline(emptyPayload({ revenueMl: 1000 })),
      "revenueMl",
      1200,
    );
    const fresh = emptyPayload({ revenueMl: 1500 });
    const merged = mergePreservedManualLines(fresh, previous, []);
    assert.equal(merged.revenueMl, 1500);
    assert.deepEqual(merged.manuallyEditedLineKeys, []);
  });
});

describe("mergeProductCostBreakdowns", () => {
  it("keeps leveled and cadastro rows for the same SKU separate", () => {
    const merged = mergeProductCostBreakdowns([
      [
        {
          key: productCostAuditKey("SKU-A", true),
          sku: "SKU-A",
          title: "Produto A",
          quantity: 10,
          unitCost: 41,
          totalCost: 410,
          missingCost: false,
          leveled: true,
        },
        {
          key: productCostAuditKey("SKU-A", false),
          sku: "SKU-A",
          title: "Produto A",
          quantity: 5,
          unitCost: 50,
          totalCost: 250,
          missingCost: false,
        },
      ],
    ]);

    assert.equal(merged.length, 2);
    const leveled = merged.find((row) => row.leveled);
    const cadastro = merged.find((row) => !row.leveled);
    assert.equal(leveled?.quantity, 10);
    assert.equal(leveled?.unitCost, 41);
    assert.equal(cadastro?.quantity, 5);
    assert.equal(cadastro?.unitCost, 50);
  });
});

describe("breakdownIdentityKey", () => {
  it("keys by itemId, not by sku text", () => {
    assert.equal(breakdownIdentityKey("MLB1", "SKU-A"), "item:MLB1");
  });

  it("gives two products different keys even when they share the same sku text (Product.sku is not unique)", () => {
    const key1 = breakdownIdentityKey("MLB1", "SKU-COLIDIU");
    const key2 = breakdownIdentityKey("MLB2", "SKU-COLIDIU");
    assert.notEqual(key1, key2);
  });

  it("falls back to normalized sku text when itemId is absent (defensive)", () => {
    assert.equal(breakdownIdentityKey(null, "  sku-a  "), "sku-a");
    assert.equal(breakdownIdentityKey(undefined, null), "(sem SKU)");
  });
});

describe("isDreEditableLineKey", () => {
  it("accepts every real editable line key", () => {
    for (const key of [
      "revenueMl",
      "productCostErp",
      "taxErp",
      "adsCost",
      "affiliateFeeMl",
    ]) {
      assert.equal(isDreEditableLineKey(key), true);
    }
  });

  it("rejects unknown keys", () => {
    assert.equal(isDreEditableLineKey("bogusKey"), false);
    assert.equal(isDreEditableLineKey(""), false);
  });
});

describe("getEditableLineAmount", () => {
  it("reads the stored amount for a key", () => {
    const payload = emptyPayload({ revenueMl: 500 });
    assert.equal(getEditableLineAmount(payload, "revenueMl"), 500);
  });

  it("defaults to 0 when the field is missing/undefined", () => {
    const payload = { ...emptyPayload(), revenueMl: undefined } as unknown as DreMonthSnapshotPayload;
    assert.equal(getEditableLineAmount(payload, "revenueMl"), 0);
  });
});

describe("buildSyncedLineBaseline", () => {
  it("captures all 15 editable line keys, defaulting missing ones to 0", () => {
    const payload = emptyPayload({ revenueMl: 1000, saleFeeMl: -50, adsCost: 30 });
    const baseline = buildSyncedLineBaseline(payload);
    assert.equal(baseline.revenueMl, 1000);
    assert.equal(baseline.saleFeeMl, -50);
    assert.equal(baseline.adsCost, 30);
    assert.equal(baseline.taxErp, 0);
    assert.equal(Object.keys(baseline).length, 15);
  });
});

describe("captureSyncedBreakdowns", () => {
  it("captures only breakdown fields that are actually present on the payload", () => {
    const payload = emptyPayload({
      saleFeeBreakdown: [
        { key: "a", sku: null, title: "x", quantity: 1, amount: -10 },
      ],
    });
    const captured = captureSyncedBreakdowns(payload);
    assert.ok(captured.saleFeeBreakdown);
    assert.equal(captured.saleFeeBreakdown?.length, 1);
    assert.equal("revenueBreakdown" in captured, false);
    assert.equal("productCostBreakdown" in captured, false);
  });
});

describe("normalizeProductCostAuditMergeKey", () => {
  it("appends ::leveled or ::cadastro when the key doesn't already have a suffix", () => {
    assert.equal(
      normalizeProductCostAuditMergeKey({ key: "SKU-A", leveled: true }),
      "SKU-A::leveled",
    );
    assert.equal(
      normalizeProductCostAuditMergeKey({ key: "SKU-A", leveled: false }),
      "SKU-A::cadastro",
    );
  });

  it("leaves an already-suffixed key untouched", () => {
    assert.equal(
      normalizeProductCostAuditMergeKey({ key: "SKU-A::leveled", leveled: false }),
      "SKU-A::leveled",
    );
  });
});

describe("commitReconciledLinesAsTruth", () => {
  it("moves the current value of the given keys into the baseline and clears their manual-edit mark", () => {
    const edited = applyManualLineEdit(
      withSyncLineBaseline(emptyPayload({ revenueMl: 1000, saleFeeMl: -100 })),
      "revenueMl",
      1250,
    );
    assert.deepEqual(edited.manuallyEditedLineKeys, ["revenueMl"]);

    const committed = commitReconciledLinesAsTruth(edited, ["revenueMl"]);
    assert.equal(committed.syncedLineBaseline?.revenueMl, 1250);
    assert.deepEqual(committed.manuallyEditedLineKeys, []);
    // Untouched keys keep their existing baseline.
    assert.equal(committed.syncedLineBaseline?.saleFeeMl, -100);
  });
});

describe("cancelledIncludeOverlay invalidation", () => {
  const withOverlay = () =>
    withSyncLineBaseline(
      emptyPayload({
        revenueMl: 1000,
        saleFeeMl: -50,
        cancelledIncludeOverlay: {
          revenueGross: 100,
          productCostErp: -20,
          taxErp: -5,
        },
      }),
    );

  it("applyManualLineEdit clears the overlay when editing revenueMl/productCostErp/taxErp", () => {
    assert.equal(
      applyManualLineEdit(withOverlay(), "revenueMl", 1100).cancelledIncludeOverlay,
      undefined,
    );
    assert.equal(
      applyManualLineEdit(withOverlay(), "productCostErp", -30).cancelledIncludeOverlay,
      undefined,
    );
    assert.equal(
      applyManualLineEdit(withOverlay(), "taxErp", -10).cancelledIncludeOverlay,
      undefined,
    );
  });

  it("applyManualLineEdit keeps the overlay when editing an unrelated key", () => {
    const edited = applyManualLineEdit(withOverlay(), "saleFeeMl", -60);
    assert.ok(edited.cancelledIncludeOverlay);
    assert.equal(edited.cancelledIncludeOverlay?.revenueGross, 100);
  });

  it("mergePreservedManualLines clears the overlay when a preserved key is revenueMl/productCostErp/taxErp", () => {
    const previous = applyManualLineEdit(withOverlay(), "revenueMl", 1300);
    const fresh = emptyPayload({ revenueMl: 1500 });
    const merged = mergePreservedManualLines(fresh, previous, ["revenueMl"]);
    assert.equal(merged.cancelledIncludeOverlay, undefined);
  });

  it("applyRestoreLineFromSync clears the overlay when restoring revenueMl/productCostErp/taxErp", () => {
    const edited = applyManualLineEdit(withOverlay(), "revenueMl", 1100);
    const restored = applyRestoreLineFromSync(edited, "revenueMl");
    assert.ok(restored);
    assert.equal(restored?.cancelledIncludeOverlay, undefined);
  });
});

describe("mergePreservedManualLines — baseline-drift edge case", () => {
  it("stops marking a key as adjusted once the new sync's baseline happens to match the preserved manual value", () => {
    // User edited revenueMl from 1000 -> 1200 (old baseline 1000).
    const previous = applyManualLineEdit(
      withSyncLineBaseline(emptyPayload({ revenueMl: 1000 })),
      "revenueMl",
      1200,
    );
    // A fresh sync now reports 1200 as the real baseline — the same amount
    // the user had manually set. The preserved value must be compared
    // against the NEW baseline (1200), not the old one (1000).
    const fresh = emptyPayload({ revenueMl: 1200 });
    const merged = mergePreservedManualLines(fresh, previous, ["revenueMl"]);
    assert.equal(merged.revenueMl, 1200);
    assert.equal(merged.syncedLineBaseline?.revenueMl, 1200);
    assert.deepEqual(merged.manuallyEditedLineKeys, []);
  });
});

describe("mergeTaxBreakdowns", () => {
  const item = (overrides: Partial<DreTaxBreakdownItem> = {}): DreTaxBreakdownItem => ({
    key: "item:MLB1",
    sku: "SKU-A",
    title: "Produto A",
    quantity: 1,
    revenue: 100,
    taxPercent: 10,
    totalTax: 10,
    missingTax: false,
    ...overrides,
  });

  it("sums quantity/revenue/totalTax by key and recomputes taxPercent", () => {
    const merged = mergeTaxBreakdowns([
      [item({ quantity: 2, revenue: 200, totalTax: 20 })],
      [item({ quantity: 3, revenue: 300, totalTax: 45 })],
    ]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].quantity, 5);
    assert.equal(merged[0].revenue, 500);
    assert.equal(merged[0].totalTax, 65);
    assert.equal(merged[0].taxPercent, 13);
  });

  it("keeps distinct keys separate and sorts descending by totalTax", () => {
    const merged = mergeTaxBreakdowns([
      [item({ key: "item:A", totalTax: 5 }), item({ key: "item:B", totalTax: 50 })],
    ]);
    assert.deepEqual(
      merged.map((m) => m.key),
      ["item:B", "item:A"],
    );
  });

  it("OR's missingTax across merged entries", () => {
    const merged = mergeTaxBreakdowns([
      [item({ missingTax: false })],
      [item({ missingTax: true })],
    ]);
    assert.equal(merged[0].missingTax, true);
  });
});

describe("mergeLineBreakdowns", () => {
  const item = (overrides: Partial<DreLineBreakdownItem> = {}): DreLineBreakdownItem => ({
    key: "item:MLB1",
    sku: "SKU-A",
    title: "Produto A",
    quantity: 1,
    amount: 10,
    ...overrides,
  });

  it("sums quantity and amount by key", () => {
    const merged = mergeLineBreakdowns([
      [item({ quantity: 2, amount: 20 })],
      [item({ quantity: 3, amount: 30 })],
    ]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].quantity, 5);
    assert.equal(merged[0].amount, 50);
  });

  it("keeps quantity null when every merged entry has a null quantity", () => {
    const merged = mergeLineBreakdowns([
      [item({ quantity: null, amount: 10 })],
      [item({ quantity: null, amount: 20 })],
    ]);
    assert.equal(merged[0].quantity, null);
    assert.equal(merged[0].amount, 30);
  });

  it("treats a null quantity as 0 when merged with a non-null quantity", () => {
    const merged = mergeLineBreakdowns([
      [item({ quantity: null, amount: 10 })],
      [item({ quantity: 4, amount: 20 })],
    ]);
    assert.equal(merged[0].quantity, 4);
  });

  it("sorts descending by amount", () => {
    const merged = mergeLineBreakdowns([
      [item({ key: "item:A", amount: 5 }), item({ key: "item:B", amount: 50 })],
    ]);
    assert.deepEqual(
      merged.map((m) => m.key),
      ["item:B", "item:A"],
    );
  });
});

describe("getYearProductCostBreakdown / getYearTaxBreakdown / getYearLineBreakdown", () => {
  const productCostItem = (overrides: Partial<DreProductCostBreakdownItem> = {}): DreProductCostBreakdownItem => ({
    key: "item:MLB1",
    sku: "SKU-A",
    title: "Produto A",
    quantity: 1,
    unitCost: 10,
    totalCost: 10,
    missingCost: false,
    ...overrides,
  });

  it("getYearProductCostBreakdown filters out months without a breakdown and merges the rest", () => {
    const result = getYearProductCostBreakdown([
      { productCostBreakdown: [productCostItem({ quantity: 2, totalCost: 20 })] },
      { productCostBreakdown: null },
      { productCostBreakdown: [productCostItem({ quantity: 3, totalCost: 30 })] },
    ]);
    assert.equal(result.length, 1);
    assert.equal(result[0].quantity, 5);
    assert.equal(result[0].totalCost, 50);
  });

  it("getYearTaxBreakdown filters out months without a breakdown and merges the rest", () => {
    const taxItem = (overrides: Partial<DreTaxBreakdownItem> = {}): DreTaxBreakdownItem => ({
      key: "item:MLB1",
      sku: "SKU-A",
      title: "Produto A",
      quantity: 1,
      revenue: 100,
      taxPercent: 10,
      totalTax: 10,
      missingTax: false,
      ...overrides,
    });
    const result = getYearTaxBreakdown([
      { taxBreakdown: [taxItem({ totalTax: 10 })] },
      { taxBreakdown: null },
      { taxBreakdown: [taxItem({ totalTax: 15 })] },
    ]);
    assert.equal(result.length, 1);
    assert.equal(result[0].totalTax, 25);
  });

  it("getYearLineBreakdown filters null lists and merges the rest", () => {
    const lineItem = (overrides: Partial<DreLineBreakdownItem> = {}): DreLineBreakdownItem => ({
      key: "item:MLB1",
      sku: "SKU-A",
      title: "Produto A",
      quantity: 1,
      amount: 10,
      ...overrides,
    });
    const result = getYearLineBreakdown([
      [lineItem({ amount: 10 })],
      null,
      [lineItem({ amount: 20 })],
    ]);
    assert.equal(result.length, 1);
    assert.equal(result[0].amount, 30);
  });
});
