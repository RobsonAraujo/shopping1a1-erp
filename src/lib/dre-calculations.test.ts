import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeDreTotals,
  percentOfRevenue,
  sumYearLineAmounts,
} from "./dre-calculations";
import { mapBillingSummaryToDreLines } from "./mercadolibre/billing-summary";

describe("computeDreTotals", () => {
  it("computes margem and lucro with negative operational costs", () => {
    const totals = computeDreTotals(
      {
        revenueMl: 63160.3,
        cancelledSalesMl: -2034.7,
        saleFeeMl: -7191.93,
        partialReturnsMl: 0,
        productCostErp: -30091.31,
        taxErp: -11395.19,
        sellerShippingMl: -8930.39,
      },
      4400,
      [{ costItemId: "rent", amount: 3000 }],
    );

    assert.equal(totals.totalEntrada, 63160.3);
    assert.ok(totals.totalCustoOperacional < 0);
    assert.equal(totals.margemContribuicao, 3516.78);
    assert.equal(totals.margemContribuicaoPercent, 5.57);
    assert.equal(totals.totalCustoFixo, -7400);
    assert.equal(totals.lucroLiquido, -3883.22);
  });

  it("returns null percent when revenue is zero", () => {
    assert.equal(percentOfRevenue(100, 0), null);
  });
});

describe("sumYearLineAmounts", () => {
  it("sums months", () => {
    const sum = sumYearLineAmounts([
      {
        revenueMl: 100,
        cancelledSalesMl: -10,
        saleFeeMl: -5,
        partialReturnsMl: 0,
        productCostErp: -20,
        taxErp: -8,
        sellerShippingMl: -7,
      },
      {
        revenueMl: 200,
        cancelledSalesMl: -20,
        saleFeeMl: -10,
        partialReturnsMl: 0,
        productCostErp: -40,
        taxErp: -16,
        sellerShippingMl: -14,
      },
    ]);
    assert.equal(sum.revenueMl, 300);
    assert.equal(sum.saleFeeMl, -15);
  });
});

describe("mapBillingSummaryToDreLines", () => {
  it("maps ML billing charges by label", () => {
    const mapped = mapBillingSummaryToDreLines({
      charges: [
        { label: "Tarifa por vender", amount: 7191.93, type: "CXD" },
        { label: "Frete vendedor", amount: 8930.39, type: "SHP" },
        { label: "Vendas canceladas", amount: 2034.7 },
      ],
      bonuses: [{ label: "Devolução parcial", amount: 0 }],
    });

    assert.equal(mapped.saleFee, -7191.93);
    assert.equal(mapped.sellerShipping, -8930.39);
    assert.equal(mapped.cancelledSales, -2034.7);
    assert.equal(mapped.partialReturns, 0);
  });
});
