import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as XLSX from "xlsx";
import { parseBrMoney, parseFeeDetailsCell } from "./fee-details-parser";
import { resolveFeeLineKey } from "./fee-name-mapping";
import { aggregateReconciliationRows } from "./aggregate";
import { assertSheetMatchesMonth } from "./sheet-period";
import { ReconciliationParseError, type ReconciliationRow } from "./types";
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
  it("maps known fee names and leaves unknown names out of the DRE", () => {
    assert.equal(
      resolveFeeLineKey("Custo por vender no Mercado Livre").lineKey,
      "saleFeeMl",
    );
    assert.equal(
      resolveFeeLineKey("Tarifa pelo serviço de armazenamento Full").lineKey,
      "fullStorageMl",
    );
    assert.deepEqual(resolveFeeLineKey("Tarifa misteriosa XYZ"), {
      kind: "unrecognized",
      lineKey: null,
      credit: false,
    });
    assert.equal(resolveFeeLineKey("").kind, "unrecognized");
  });

  it("maps the names that used to fall into special fees (planilha out/2026)", () => {
    const nonCompliance = resolveFeeLineKey(
      "Cancelamento da tarifa por inconformidade no Envios Full",
    );
    assert.equal(nonCompliance.lineKey, "fullNonComplianceMl");
    assert.equal(nonCompliance.credit, true);

    assert.equal(
      resolveFeeLineKey("Tarifa de devolução por envio interno no município")
        .lineKey,
      "returnFeeMl",
    );
    const returnCredit = resolveFeeLineKey("Cancelamento da tarifa por devolução");
    assert.equal(returnCredit.lineKey, "returnFeeMl");
    assert.equal(returnCredit.credit, true);

    assert.equal(
      resolveFeeLineKey("Custo do serviço de coleta Full").lineKey,
      "fullShippingMl",
    );
    assert.equal(
      resolveFeeLineKey(
        "Cobrança do diferencial de alíquota interestadual (ICMS-DIFAL)",
      ).kind,
      "difal",
    );
    assert.equal(resolveFeeLineKey("Juros do empréstimo").kind, "non_operational");
  });

  it("maps shipping to seller freight and skips ads and installment fees", () => {
    const ads = resolveFeeLineKey(
      "Tarifa por campanha de publicidade de Product Ads",
    );
    assert.equal(ads.kind, "skipped");
    assert.equal(ads.lineKey, null);

    const shipping = resolveFeeLineKey("Tarifa de envio extra ou intermunicipal");
    assert.equal(shipping.kind, "line");
    assert.equal(shipping.lineKey, "sellerShippingMl");
    assert.equal(shipping.credit, false);

    const installment = resolveFeeLineKey(
      "Taxa de parcelamento (equivalente ao acréscimo no preço pago pelo comprador)",
    );
    assert.equal(installment.kind, "skipped");

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

const LUCRO_REAL = { difalCountsAsFee: false };
const SIMPLES = { difalCountsAsFee: true };
const aggregateLucroReal = (rows: ReconciliationRow[]) =>
  aggregateReconciliationRows(rows, LUCRO_REAL);

describe("aggregateReconciliationRows", () => {
  it("aggregates sales, cancellations and storage with DRE signs", () => {
    const result = aggregateLucroReal([
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
    const result = aggregateLucroReal([
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
    const result = aggregateLucroReal([
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
    const result = aggregateLucroReal([
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
    const result = aggregateLucroReal([
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
    const result = aggregateLucroReal([
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
    assert.equal(result.excludedFees.length, 0);
  });

  it("always reports Tarifas especiais, zero when the sheet has none", () => {
    const result = aggregateLucroReal([row({ operationId: "s1" })]);
    assert.equal(result.amounts.specialFeesMl, 0);
    assert.equal(result.breakdowns.specialFeesMl, undefined);
  });

  const difalRow = (operationId: string, amount: number) =>
    row({
      rowIndex: 105,
      operationId,
      operationType: "Cobrança de DIFAL",
      operationStatus: null,
      operationDate: new Date(Date.UTC(2026, 9, 28)),
      closingDate: new Date(Date.UTC(2026, 10, 4)),
      billingPeriod: "2026-11",
      itemId: null,
      itemTitle: null,
      sku: null,
      quantity: null,
      feeDetails: [
        {
          feeId: operationId,
          name: "Cobrança do diferencial de alíquota interestadual (ICMS-DIFAL)",
          grossAmount: amount,
          discountAmount: 0,
          netAmount: amount,
          postpaid: true,
        },
      ],
    });

  it("leaves the ML DIFAL out in Lucro Real (already in sales tax) with the path to find it", () => {
    const result = aggregateLucroReal([
      difalRow("74346756344", 13.05),
      difalRow("74346073714", 7.85),
    ]);
    assert.equal(result.amounts.specialFeesMl, 0);
    assert.equal(result.excludedFees.length, 1);
    const [difal] = result.excludedFees;
    assert.equal(difal?.reason, "in_sales_tax");
    assert.equal(difal?.total, -20.9);
    assert.equal(difal?.occurrences, 2);
    assert.deepEqual(difal?.samples[0], {
      rowIndex: 105,
      operationDate: "2026-10-28",
      operationId: "74346756344",
      operationType: "Cobrança de DIFAL",
      feeId: "74346756344",
      amount: -13.05,
      billingPeriod: "2026-11",
      closingDate: "2026-11-04",
    });
  });

  it("keeps the ML DIFAL in Tarifas especiais in the Simples (DAS has no DIFAL)", () => {
    const result = aggregateReconciliationRows(
      [difalRow("74346756344", 13.05), difalRow("74346073714", 7.85)],
      SIMPLES,
    );
    assert.equal(result.amounts.specialFeesMl, -20.9);
    assert.equal(result.breakdowns.specialFeesMl?.length, 2);
    assert.equal(result.excludedFees.length, 0);
  });

  it("leaves loan interest and unknown fees out of every line", () => {
    const fee = (name: string, netAmount: number) => ({
      feeId: "f",
      name,
      grossAmount: netAmount,
      discountAmount: 0,
      netAmount,
      postpaid: true,
    });
    const result = aggregateLucroReal([
      row({
        operationId: "73996779726",
        operationType: "Movimentações de empréstimo",
        feeDetails: [fee("Juros do empréstimo", 6373.08)],
      }),
      row({ operationId: "x1", feeDetails: [fee("Tarifa misteriosa XYZ", 5)] }),
      row({
        operationId: "inc",
        operationType: "Inconformidade no envio ao Full",
        feeDetails: [
          fee("Custo por inconformidade no Envios Full", 846),
          fee("Cancelamento da tarifa por inconformidade no Envios Full", 846),
        ],
      }),
      row({
        operationId: "col",
        operationType: "Coleta Full",
        feeDetails: [fee("Custo do serviço de coleta Full", 143.81)],
      }),
    ]);
    assert.equal(result.amounts.specialFeesMl, 0);
    assert.equal(result.amounts.saleFeeMl, undefined);
    assert.equal(result.amounts.fullNonComplianceMl, 0);
    assert.equal(result.amounts.fullShippingMl, -143.81);
    assert.deepEqual(
      result.excludedFees.map((item) => [item.reason, item.name, item.total]),
      [
        ["non_operational", "Juros do empréstimo", -6373.08],
        ["unrecognized", "Tarifa misteriosa XYZ", -5],
      ],
    );
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

describe("assertSheetMatchesMonth", () => {
  const dated = (...dates: (string | null)[]) =>
    dates.map((d) => ({ operationDate: d ? new Date(`${d}T00:00:00.000Z`) : null }));

  it("accepts the sheet of the chosen month, even with a few rows from the next one", () => {
    assert.doesNotThrow(() =>
      assertSheetMatchesMonth(
        dated("2026-10-01", "2026-10-15", "2026-10-28", "2026-11-01", null),
        2026,
        10,
      ),
    );
  });

  it("refuses another month's sheet and says which month it is (julho com a planilha de janeiro)", () => {
    assert.throws(
      () => assertSheetMatchesMonth(dated("2026-01-05", "2026-01-20", "2026-01-31"), 2026, 7),
      (error: unknown) =>
        error instanceof ReconciliationParseError &&
        error.code === "wrong_month" &&
        error.message.includes("01/2026") &&
        error.message.includes("07/2026"),
    );
  });

  it("does not block a sheet without operation dates", () => {
    assert.doesNotThrow(() => assertSheetMatchesMonth(dated(null, null), 2026, 7));
  });
});
