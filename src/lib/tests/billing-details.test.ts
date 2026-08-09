import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aggregateMlBillingDetails,
  mergeBillingLines,
} from "../mercadolibre/billing-details";
import { mapBillingSummaryToDreLines } from "../mercadolibre/billing-summary";

describe("aggregateMlBillingDetails", () => {
  it("aggregates MLB sub types CVVML, CFFE, CFCBI, CFPB", () => {
    const agg = aggregateMlBillingDetails([
      {
        charge_info: {
          detail_amount: 15945.07,
          detail_type: "CHARGE",
          detail_sub_type: "CVVML",
          transaction_detail: "Tarifa ML",
        },
      },
      {
        charge_info: {
          detail_amount: 890.58,
          detail_type: "CHARGE",
          detail_sub_type: "CVVPRC",
          transaction_detail: "Tarifa ML",
        },
      },
      {
        charge_info: {
          detail_amount: 2778.27,
          detail_type: "CHARGE",
          detail_sub_type: "CFFE",
          transaction_detail: "Tarifa de envio extra ou intermunicipal",
        },
      },
      {
        charge_info: {
          detail_amount: 775.62,
          detail_type: "CHARGE",
          detail_sub_type: "CFCBI",
          transaction_detail: "Custo do serviço de coleta Full",
        },
      },
      {
        charge_info: {
          detail_amount: 228,
          detail_type: "CHARGE",
          detail_sub_type: "CFPB",
          transaction_detail: "Custo por inconformidade nos envios",
        },
      },
      {
        charge_info: {
          detail_amount: 3143.3,
          detail_type: "CHARGE",
          detail_sub_type: "PADS",
          transaction_detail: "Product Ads",
        },
      },
      {
        charge_info: {
          detail_amount: 609.52,
          detail_type: "BONUS",
          detail_sub_type: "BVVML",
          transaction_detail: "Bonificação tarifa",
        },
      },
    ]);

    assert.equal(agg.saleFeeMl, round(-15945.07 -890.58 + 609.52));
    assert.equal(agg.sellerShippingMl, -2778.27);
    assert.equal(agg.fullShippingMl, -775.62);
    assert.equal(agg.fullNonComplianceMl, -228);
    assert.equal(agg.adsCost, 3143.3);
  });
});

describe("mapBillingSummaryToDreLines", () => {
  it("maps MLB summary charge types", () => {
    const mapped = mapBillingSummaryToDreLines({
      bill_includes: {
        charges: [
          { label: "Tarifa de venda", amount: 40.37, type: "CV" },
          { label: "CVVML", amount: 15945.07, type: "CVVML" },
          { label: "Tarifa de envio extra ou intermunicipal", amount: 2778.27, type: "CFFE" },
          { label: "Custo do serviço de coleta Full", amount: 775.62, type: "CFCBI" },
          { label: "Campanhas de publicidade - Product Ads", amount: 3143.3, type: "PADS" },
        ],
        bonuses: [{ label: "BVVML", amount: 609.52, type: "BVVML" }],
      },
    });

    assert.equal(mapped.saleFee, round(-15945.07 - 40.37 + 609.52));
    assert.equal(mapped.sellerShipping, -2778.27);
    assert.equal(mapped.fullShipping, -775.62);
    assert.equal(mapped.adsCost, 3143.3);
  });
});

describe("mergeBillingLines", () => {
  it("prefers details for costs", () => {
    const merged = mergeBillingLines(
      {
        revenueMl: 50000,
        revenueFromOrders: 50000,
        saleFeeMl: -19000,
        sellerShippingMl: -2800,
        cancelledSalesMl: 0,
        partialReturnsMl: 0,
        adsCost: 3100,
        fullShippingMl: -770,
        fullStorageMl: -100,
        fullNonComplianceMl: -228,
        unmappedCharges: 0,
        chargeCount: 10,
        bySubType: {},
        byLabel: {},
      },
      {
        revenueMl: null,
        saleFee: -40,
        sellerShipping: 0,
        cancelledSales: 0,
        partialReturns: 0,
        fullShipping: 0,
        fullStorage: 0,
        fullNonCompliance: 0,
        adsCost: 0,
      },
      { fullShipping: 0, fullStorage: 0, fullNonCompliance: 0 },
    );

    assert.equal(merged.saleFee, -19000);
    assert.equal(merged.fullNonCompliance, -228);
  });
});

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
