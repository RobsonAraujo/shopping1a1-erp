import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aggregateMlBillingDetails,
  mergeBillingLines,
  preferCompleteBillingAmount,
} from "../billing-details";
import { mapBillingSummaryToDreLines } from "../billing-summary";

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
      {
        charge_info: {
          detail_amount: 93.73,
          detail_type: "CHARGE",
          detail_sub_type: "CVAF",
          transaction_detail: "cargo por venta con afiliados",
        },
      },
      {
        charge_info: {
          detail_amount: 99,
          detail_type: "CHARGE",
          detail_sub_type: "CESM",
          transaction_detail: "Tarifa de manutenção do eShop",
        },
      },
    ]);

    assert.equal(agg.saleFeeMl, round(-15945.07 -890.58 + 609.52));
    assert.equal(agg.sellerShippingMl, -2778.27);
    assert.equal(agg.fullShippingMl, -775.62);
    assert.equal(agg.fullNonComplianceMl, -228);
    assert.equal(agg.adsCost, 3143.3);
    assert.equal(agg.affiliateFeeMl, -93.73);
    assert.equal(agg.minhaPaginaMl, -99);
    assert.deepEqual(agg.cancelledOrderIds, []);
    const saleFeeRows = agg.lineBreakdowns.saleFeeMl ?? [];
    assert.equal(saleFeeRows.length, 2);
    assert.equal(
      saleFeeRows.find((row) => row.title === "Tarifa ML")?.amount,
      round(-15945.07 - 890.58),
    );
    assert.equal(
      saleFeeRows.find((row) => row.title === "Bonificação tarifa")?.amount,
      609.52,
    );
  });

  it("collects order ids from CXC / cancelled billing lines", () => {
    const agg = aggregateMlBillingDetails([
      {
        charge_info: {
          detail_amount: 100,
          detail_type: "CHARGE",
          detail_sub_type: "CXC",
          transaction_detail: "Venda cancelada",
        },
        order_id: 111,
        sales_info: [{ order_id: 222, transaction_amount: 100 }],
      },
      {
        charge_info: {
          detail_amount: 50,
          detail_type: "CHARGE",
          detail_sub_type: "CXC",
          transaction_detail: "Venda cancelada",
        },
        sales_info: [{ order_id: 111, transaction_amount: 50 }],
      },
      {
        charge_info: {
          detail_amount: 30,
          detail_type: "CHARGE",
          detail_sub_type: "CVVML",
          transaction_detail: "Tarifa ML",
        },
        order_id: 999,
      },
    ]);

    assert.equal(agg.cancelledSalesMl, -150);
    assert.deepEqual([...agg.cancelledOrderIds].sort(), ["111", "222"]);
  });

  it("collects return-fee order ids (devolvidas still paid) and items_info ids", () => {
    const agg = aggregateMlBillingDetails([
      {
        charge_info: {
          detail_amount: 11.36,
          detail_type: "CHARGE",
          detail_sub_type: "CDSDB",
          transaction_detail: "Tarifa pela devolução",
        },
        sales_info: [{ order_id: "200001111", transaction_amount: 80 }],
        items_info: [{ item_id: "MLB1", item_amount: 1, order_id: 200001222 }],
        shipping_info: { pack_id: "2000013274412025" },
      },
      {
        charge_info: {
          detail_amount: 4.12,
          detail_type: "BONUS",
          detail_sub_type: "BVVML",
          transaction_detail: "Cancelamento do Custo por vender no Mercado Livre",
        },
        sales_info: [{ order_id: 999999, transaction_amount: 47.6 }],
      },
    ]);

    assert.ok(agg.cancelledOrderIds.includes("200001111"));
    assert.ok(agg.cancelledOrderIds.includes("200001222"));
    assert.ok(agg.cancelledOrderIds.includes("2000013274412025"));
    assert.equal(agg.cancelledOrderIds.includes("999999"), false);
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
          { label: "CVAF", amount: 107.29, type: "CVAF" },
          { label: "Tarifa de manutenção do eShop", amount: 163, type: "CESM" },
        ],
        bonuses: [{ label: "BVVML", amount: 609.52, type: "BVVML" }],
      },
    });

    assert.equal(mapped.saleFee, round(-15945.07 - 40.37 + 609.52));
    assert.equal(mapped.sellerShipping, -2778.27);
    assert.equal(mapped.fullShipping, -775.62);
    assert.equal(mapped.adsCost, 3143.3);
    assert.equal(mapped.affiliateFee, -107.29);
    assert.equal(mapped.minhaPagina, -163);
  });
});

describe("mergeBillingLines", () => {
  it("prefers details when they are the more complete rollup", () => {
    const merged = mergeBillingLines(
      {
        revenueMl: 50000,
        revenueFromOrders: 50000,
        saleFeeMl: -19000,
        sellerShippingMl: -2800,
        cancelledSalesMl: 0,
        partialReturnsMl: 0,
        returnFeeMl: 0,
        specialFeesMl: 0,
        adsCost: 3100,
        fullShippingMl: -770,
        fullStorageMl: -100,
        fullNonComplianceMl: -228,
        minhaPaginaMl: -99,
        affiliateFeeMl: -20.46,
        unmappedCharges: 0,
        chargeCount: 10,
        bySubType: {},
        byLabel: {},
        cancelledOrderIds: [],
        lineBreakdowns: {},
      },
      {
        revenueMl: null,
        saleFee: -40,
        sellerShipping: 0,
        cancelledSales: 0,
        partialReturns: 0,
        returnFee: 0,
        specialFees: 0,
        fullShipping: 0,
        fullStorage: 0,
        fullNonCompliance: 0,
        adsCost: 0,
        minhaPagina: 0,
        affiliateFee: 0,
      },
      { fullShipping: 0, fullStorage: 0, fullNonCompliance: 0 },
    );

    assert.equal(merged.saleFee, -19000);
    assert.equal(merged.fullNonCompliance, -228);
    assert.equal(merged.minhaPagina, -99);
    assert.equal(merged.affiliateFee, -20.46);
  });

  it("prefers summary when details undercount (partial /details response)", () => {
    const merged = mergeBillingLines(
      {
        revenueMl: null,
        revenueFromOrders: 23916,
        saleFeeMl: -4176.93,
        sellerShippingMl: -5133.7,
        cancelledSalesMl: 405.15,
        partialReturnsMl: 0,
        returnFeeMl: 0,
        specialFeesMl: 0,
        adsCost: 1024,
        fullShippingMl: 0,
        fullStorageMl: 0,
        fullNonComplianceMl: 0,
        minhaPaginaMl: 0,
        affiliateFeeMl: 0,
        unmappedCharges: 0,
        chargeCount: 1950,
        bySubType: {},
        byLabel: {},
        cancelledOrderIds: [],
        lineBreakdowns: {},
      },
      {
        revenueMl: null,
        saleFee: -19180.41,
        sellerShipping: -32104.43,
        cancelledSales: 18,
        partialReturns: 26.5,
        returnFee: 0,
        specialFees: 0,
        fullShipping: -503.6,
        fullStorage: -605.47,
        fullNonCompliance: 0,
        adsCost: 7397.46,
        minhaPagina: -99,
        affiliateFee: -93.73,
      },
      {
        fullShipping: -503.6,
        fullStorage: -605.47,
        fullNonCompliance: 0,
      },
    );

    assert.equal(merged.saleFee, -19180.41);
    assert.equal(merged.sellerShipping, -32104.43);
    assert.equal(merged.affiliateFee, -93.73);
    assert.equal(merged.minhaPagina, -99);
    assert.equal(merged.adsCost, 7397.46);
    assert.equal(merged.fullShipping, -503.6);
    // Canceladas: details tem magnitude maior → details vence.
    assert.equal(merged.cancelledSales, 405.15);
  });
});

describe("preferCompleteBillingAmount", () => {
  it("falls back to summary when details are zero", () => {
    assert.equal(preferCompleteBillingAmount(0, -93.73), -93.73);
  });

  it("keeps details when summary is zero", () => {
    assert.equal(preferCompleteBillingAmount(-20.46, 0), -20.46);
  });

  it("prefers larger absolute value", () => {
    assert.equal(preferCompleteBillingAmount(-4176, -19180), -19180);
    assert.equal(preferCompleteBillingAmount(-20000, -100), -20000);
  });
});

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
