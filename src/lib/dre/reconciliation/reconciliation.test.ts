import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as XLSX from "xlsx";
import { parseBrMoney, parseFeeDetailsCell } from "./fee-details-parser";
import { resolveFeeLineKey } from "./fee-name-mapping";
import { aggregateReconciliationRows } from "./aggregate";
import type { ReconciliationRow } from "./types";
import { parseReconciliationWorkbook } from "./xlsx-parser";

describe("parseBrMoney", () => {
  it("parses Brazilian money strings", () => {
    assert.equal(parseBrMoney("1.234,56"), 1234.56);
    assert.equal(parseBrMoney("-5166,86"), -5166.86);
    assert.equal(parseBrMoney(10.5), 10.5);
  });
});

describe("parseFeeDetailsCell", () => {
  it("parses multiple semi-structured fee blocks", () => {
    const cell = `{Tarifa 1
ID da tarifa: 1
Nome da tarifa: Custo por vender no Mercado Livre
Valor bruto: 19,26
Desconto aplicado: 0,00
Valor líquido: 19,26
Pós-paga: Não;}
{Tarifa 2
ID da tarifa: 2
Nome da tarifa: Tarifa pelo serviço de armazenamento Full
Valor bruto: 0,15
Desconto aplicado: 0,00
Valor líquido: 0,15
Pós-paga: Sim;}`;
    const fees = parseFeeDetailsCell(cell);
    assert.equal(fees.length, 2);
    assert.equal(fees[0]?.name, "Custo por vender no Mercado Livre");
    assert.equal(fees[0]?.netAmount, 19.26);
    assert.equal(fees[1]?.name, "Tarifa pelo serviço de armazenamento Full");
    assert.equal(fees[1]?.netAmount, 0.15);
  });
});

describe("resolveFeeLineKey", () => {
  it("maps known fee names and falls back to special fees", () => {
    assert.equal(
      resolveFeeLineKey("Custo por vender no Mercado Livre").lineKey,
      "saleFeeMl",
    );
    assert.equal(
      resolveFeeLineKey("Tarifa pelo serviço de armazenamento Full").lineKey,
      "fullStorageMl",
    );
    assert.equal(resolveFeeLineKey("Tarifa misteriosa XYZ").recognized, false);
    assert.equal(
      resolveFeeLineKey("Tarifa misteriosa XYZ").lineKey,
      "specialFeesMl",
    );
  });

  it("maps shipping to seller freight and skips ads and installment fees", () => {
    const ads = resolveFeeLineKey(
      "Tarifa por campanha de publicidade de Product Ads",
    );
    assert.equal(ads.skipped, true);
    assert.equal(ads.lineKey, null);

    const shipping = resolveFeeLineKey("Tarifa de envio extra ou intermunicipal");
    assert.equal(shipping.skipped, false);
    assert.equal(shipping.lineKey, "sellerShippingMl");
    assert.equal(shipping.credit, false);

    const installment = resolveFeeLineKey(
      "Taxa de parcelamento (equivalente ao acréscimo no preço pago pelo comprador)",
    );
    assert.equal(installment.skipped, true);

    const cancelSale = resolveFeeLineKey(
      "Cancelamento do Custo por vender no Mercado Livre",
    );
    assert.equal(cancelSale.lineKey, "saleFeeMl");
    assert.equal(cancelSale.credit, true);

    const cancelShip = resolveFeeLineKey(
      "Cancelamento da tarifa de envio extra ou intermunicipal",
    );
    assert.equal(cancelShip.lineKey, "sellerShippingMl");
    assert.equal(cancelShip.credit, true);

    const returnFee = resolveFeeLineKey("Tarifa de devolução");
    assert.equal(returnFee.lineKey, "returnFeeMl");
    assert.equal(returnFee.credit, false);
  });
});

function row(overrides: Partial<ReconciliationRow>): ReconciliationRow {
  return {
    rowIndex: 4,
    operationDate: null,
    operationId: "op-1",
    operationType: "Venda",
    operationStatus: "Pago",
    saleDate: null,
    itemId: "MLB1",
    itemTitle: "Cabo",
    sku: "SKU-1",
    category: null,
    listingType: null,
    quantity: 1,
    itemValue: 80.5,
    mlRebate: 0,
    sellerDiscount: 0,
    buyerPaidShipping: 10.99,
    buyerInstallmentFee: 0,
    grossValue: 80.5,
    mlBuyerBenefits: 0,
    totalFees: 19.26,
    totalPostpaidFees: 0,
    netAfterFees: 61.24,
    feeDetails: [
      {
        feeId: "1",
        name: "Custo por vender no Mercado Livre",
        grossAmount: 19.26,
        discountAmount: 0,
        netAmount: 19.26,
        postpaid: false,
      },
    ],
    feeDetailsRaw: null,
    shipmentId: null,
    packageId: null,
    shippingMethod: null,
    shippingGross: null,
    shippingDiscount: null,
    sellerPaidShipping: 9.99,
    billingPeriod: "2026-01",
    closingDate: null,
    dueDate: null,
    paymentDetails: null,
    paymentDetailsRaw: null,
    raw: {},
    ...overrides,
  };
}

describe("aggregateReconciliationRows", () => {
  it("aggregates sales, cancellations and storage with DRE signs", () => {
    const result = aggregateReconciliationRows([
      row({ operationId: "s1" }),
      row({
        operationId: "c1",
        operationStatus: "Cancelado",
        grossValue: 50,
        sellerPaidShipping: 0,
        feeDetails: [],
      }),
      row({
        operationId: "st1",
        operationType: "Armazenamento Full",
        operationStatus: null,
        grossValue: 0,
        totalPostpaidFees: 0.15,
        sellerPaidShipping: 0,
        feeDetails: [
          {
            feeId: "x",
            name: "Tarifa pelo serviço de armazenamento Full",
            grossAmount: 0.15,
            discountAmount: 0,
            netAmount: 0.15,
            postpaid: true,
          },
        ],
      }),
    ]);

    assert.equal(result.amounts.revenueMl, undefined);
    assert.equal(result.amounts.cancelledSalesMl, undefined);
    assert.equal(result.amounts.sellerShippingMl, undefined);
    assert.equal(result.amounts.saleFeeMl, -19.26);
    assert.equal(result.amounts.fullStorageMl, -0.15);
    assert.equal(result.amounts.adsCost, undefined);
    assert.equal(result.amounts.fullShippingMl, undefined);
  });

  it("nets shipping fees minus cancellations into seller freight", () => {
    const result = aggregateReconciliationRows([
      row({
        operationId: "ship1",
        sellerPaidShipping: 99,
        feeDetails: [
          {
            feeId: "s",
            name: "Tarifa de envio extra ou intermunicipal",
            grossAmount: 20,
            discountAmount: 8,
            netAmount: 12,
            postpaid: true,
          },
        ],
      }),
      row({
        operationId: "ship-c",
        operationStatus: "Cancelado",
        grossValue: 10,
        sellerPaidShipping: 20,
        feeDetails: [
          {
            feeId: "c",
            name: "Cancelamento da tarifa de envio extra ou intermunicipal",
            grossAmount: 0,
            discountAmount: 0,
            netAmount: 3,
            postpaid: true,
          },
        ],
      }),
    ]);

    assert.equal(result.amounts.sellerShippingMl, -9);
    assert.equal(result.amounts.returnFeeMl, undefined);
  });

  it("keeps sale fees net of cancellations and ignores installment", () => {
    const result = aggregateReconciliationRows([
      row({
        operationId: "fee1",
        feeDetails: [
          {
            feeId: "v",
            name: "Custo por vender no Mercado Livre",
            grossAmount: 20,
            discountAmount: 2,
            netAmount: 18,
            postpaid: false,
          },
          {
            feeId: "p",
            name: "Taxa de parcelamento (equivalente ao acréscimo no preço pago pelo comprador)",
            grossAmount: 4,
            discountAmount: 0,
            netAmount: 4,
            postpaid: false,
          },
        ],
      }),
      row({
        operationId: "fee-c",
        operationStatus: "Cancelado",
        grossValue: 10,
        sellerPaidShipping: 0,
        feeDetails: [
          {
            feeId: "cv",
            name: "Cancelamento do Custo por vender no Mercado Livre",
            grossAmount: 0,
            discountAmount: 0,
            netAmount: 5,
            postpaid: false,
          },
        ],
      }),
    ]);

    assert.equal(result.amounts.saleFeeMl, -13);
    assert.equal(result.amounts.returnFeeMl, undefined);
  });

  it("does not reconcile partial returns from item minus gross", () => {
    const result = aggregateReconciliationRows([
      row({
        operationId: "partial-1",
        operationStatus: "Parcialmente reembolsado",
        itemValue: 61.6,
        grossValue: 19.04,
        feeDetails: [
          {
            feeId: "v",
            name: "Cancelamento do Custo por vender no Mercado Livre",
            grossAmount: 0,
            discountAmount: 0,
            netAmount: 6.98,
            postpaid: false,
          },
          {
            feeId: "c",
            name: "Cancelamento do Custo por cobrar no Mercado Pago",
            grossAmount: 0,
            discountAmount: 0,
            netAmount: 1.99,
            postpaid: false,
          },
          {
            feeId: "p",
            name: "Cancelamento da Taxa de parcelamento (equivalente ao acréscimo no preço pago pelo comprador)",
            grossAmount: 0,
            discountAmount: 0,
            netAmount: 12.81,
            postpaid: false,
          },
        ],
      }),
    ]);

    assert.equal(result.amounts.partialReturnsMl, undefined);
    assert.equal(result.amounts.saleFeeMl, 8.97);
    assert.equal(result.warnings.length, 0);
  });

  it("uses only Minha Página net fee amount, not the postpaid column", () => {
    const result = aggregateReconciliationRows([
      row({
        operationId: "mp1",
        operationType: "eShop",
        operationStatus: null,
        grossValue: 0,
        totalPostpaidFees: 99,
        sellerPaidShipping: 0,
        feeDetails: [
          {
            feeId: "99",
            name: "Tarifa de manutenção da Minha Página",
            grossAmount: 79,
            discountAmount: 0,
            netAmount: 79,
            postpaid: true,
          },
        ],
      }),
    ]);

    assert.equal(result.amounts.minhaPaginaMl, -79);
    assert.equal(result.amounts.adsCost, undefined);
  });

  it("does not reconcile ads and maps outbound shipping to seller freight", () => {
    const result = aggregateReconciliationRows([
      row({
        operationId: "ad1",
        operationType: "Anúncios MClicks",
        operationStatus: null,
        grossValue: 0,
        totalPostpaidFees: 4.01,
        sellerPaidShipping: 0,
        feeDetails: [
          {
            feeId: "ads",
            name: "Tarifa por campanha de publicidade de Product Ads",
            grossAmount: 4.01,
            discountAmount: 0,
            netAmount: 4.01,
            postpaid: true,
          },
        ],
      }),
      row({
        operationId: "sh1",
        feeDetails: [
          {
            feeId: "ship",
            name: "Tarifa de envio extra ou intermunicipal",
            grossAmount: 12,
            discountAmount: 0,
            netAmount: 12,
            postpaid: true,
          },
        ],
      }),
    ]);

    assert.equal(result.amounts.adsCost, undefined);
    assert.equal(result.amounts.fullShippingMl, undefined);
    assert.equal(result.amounts.sellerShippingMl, -12);
    assert.equal(result.unrecognizedFees.length, 0);
  });
});

function reconciliationXlsxBuffer(
  sheets: { name: string; rows: (string | number | null)[][] }[],
): Buffer {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(sheet.rows),
      sheet.name,
    );
  }
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

const POR_VENDAS_TABLE: (string | number | null)[][] = [
  ["Conciliação por vendas"],
  ["Período: julho"],
  [
    "Tipo de operação",
    "Status da operação",
    "Valor bruto",
    "Valor total de tarifas pós-pagas",
    "Detalhes de tarifas",
    "Envio pago pelo vendedor",
    "SKU",
  ],
  ["Venda", "Liberado", 80.5, 0, "", 9.99, "SKU-1"],
];

describe("parseReconciliationWorkbook", () => {
  it("reads Por Vendas files without a DAILY_CONCILIATION sheet and does not warn", () => {
    const buffer = reconciliationXlsxBuffer([
      { name: "Planilha1", rows: POR_VENDAS_TABLE },
    ]);
    const parsed = parseReconciliationWorkbook(buffer);
    assert.equal(parsed.sheetName, "Planilha1");
    assert.equal(parsed.rows.length, 1);
    assert.equal(parsed.rows[0]?.sku, "SKU-1");
    assert.equal(parsed.warnings.length, 0);
  });

  it("skips a cover sheet and uses the tab that has the sale columns", () => {
    const buffer = reconciliationXlsxBuffer([
      { name: "Resumo", rows: [["Instruções"], ["Ignore"]] },
      { name: "Vendas", rows: POR_VENDAS_TABLE },
    ]);
    const parsed = parseReconciliationWorkbook(buffer);
    assert.equal(parsed.sheetName, "Vendas");
    assert.equal(parsed.rows.length, 1);
    assert.equal(parsed.warnings.length, 0);
  });
});
