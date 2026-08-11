import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyDreIncludeCancelledView,
  computeDreTotals,
  percentOfRevenue,
  sumYearLineAmounts,
} from "../dre-calculations";
import { mapBillingSummaryToDreLines } from "../../mercadolibre/billing-summary";

const BASE_LINES = {
  revenueMl: 0,
  cancelledSalesMl: 0,
  saleFeeMl: 0,
  partialReturnsMl: 0,
  productCostErp: 0,
  taxErp: 0,
  sellerShippingMl: 0,
  fullShippingMl: 0,
  fullStorageMl: 0,
  fullNonComplianceMl: 0,
};

describe("computeDreTotals", () => {
  it("includes ADS in custos variáveis (before margem de contribuição)", () => {
    const totals = computeDreTotals(
      {
        revenueMl: 63160.3,
        cancelledSalesMl: -2034.7,
        saleFeeMl: -7191.93,
        partialReturnsMl: 0,
        productCostErp: -30091.31,
        taxErp: -11395.19,
        sellerShippingMl: -8930.39,
        fullShippingMl: -500,
        fullStorageMl: -200,
        fullNonComplianceMl: -50,
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
  it("moves cancelled revenue into entrada and keeps cancelled line as custo variável", () => {
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
    assert.equal(adjusted.productCostErp, -450);
    assert.equal(adjusted.taxErp, -115);
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
});
