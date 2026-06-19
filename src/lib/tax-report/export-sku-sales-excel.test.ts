import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSkuSalesExcelFilename,
  buildSkuSalesExcelRows,
} from "@/lib/tax-report/export-sku-sales-excel";
import type { DetalhamentoTributario } from "@/lib/tax-report/types";

function baseTransacao(
  overrides: Partial<DetalhamentoTributario["transacao"]> = {},
): DetalhamentoTributario["transacao"] {
  return {
    transactionKey: "k1",
    orderId: "ORD-1",
    orderDate: "2026-03-15T14:00:00.000Z",
    sku: "SKU-A",
    itemId: "MLB1",
    quantidade: 2,
    receitaBruta: 200,
    ufDestino: "SP",
    tipoDocumento: "CNPJ",
    documento: "12345678000199",
    contribuinteIcms: false,
    contribuinteSource: "ml_taxpayer_type",
    dadosFiscaisIndisponiveis: false,
    custoAquisicaoUnitario: 40,
    unitCostNf: 50,
    purchaseIcmsPercent: 18,
    hasIcmsSt: false,
    extraCostsUnitario: 0,
    mercadoriaImportada: false,
    conteudoImportacaoPercentual: 0,
    isMonophasic: false,
    ...overrides,
  };
}

function includedRow(
  overrides: Partial<DetalhamentoTributario> = {},
): DetalhamentoTributario {
  return {
    transacao: baseTransacao(),
    pisCofins: {
      baseDebito: 200,
      baseCredito: 41,
      pisDebito: 3.3,
      cofinsDebito: 15.2,
      debitoTotal: 18.5,
      pisCredito: 1.32,
      cofinsCredito: 6.08,
      creditoTotal: 7.4,
      liquido: 11.1,
      icmsExcluidoDaBase: 24,
      excludedIcmsFromBase: true,
    },
    icmsDifal: {
      ufOrigem: "SP",
      ufDestino: "SP",
      aliquotaInterestadual: 12,
      aliquotaInternaTotal: 18,
      icmsInterestadual: 24,
      difal: 6,
      icmsTotal: 30,
      isContribuinte: false,
      isOperacaoInterna: true,
    },
    icmsCreditoCompra: {
      baseUnitaria: 50,
      aliquotaPercent: 18,
      creditoTotal: 9,
    },
    irpjCsll: {
      baseLucro: 100,
      irpjBase: 15,
      csll: 9,
      irpjAdicional: 0,
      irpjTotal: 15,
      isEstimativaGerencial: true,
    },
    cbsIbs: null,
    impostoTotal: 65.1,
    margemLiquidaEstimada: 84.9,
    incluidoNaApuracao: true,
    memoriaCalculo: ["Linha 1", "Linha 2"],
    ...overrides,
  };
}

describe("buildSkuSalesExcelRows", () => {
  it("maps included sale with numeric tax fields and percentages", () => {
    const [row] = buildSkuSalesExcelRows([includedRow()]);

    assert.equal(row.Data, "2026-03-15");
    assert.equal(row.Pedido, "ORD-1");
    assert.equal(row.UF, "SP");
    assert.equal(row["Doc."], "CNPJ");
    assert.equal(row.Qtd, 2);
    assert.equal(row.Receita, 200);
    assert.equal(row["PIS/COFINS"], 11.1);
    assert.equal(row["PIS débito"], 3.3);
    assert.equal(row["PIS crédito"], 1.32);
    assert.equal(row["COFINS débito"], 15.2);
    assert.equal(row["COFINS crédito"], 6.08);
    assert.equal(row.ICMS, 24);
    assert.equal(row["ICMS crédito compra"], 9);
    assert.equal(row.DIFAL, 6);
    assert.equal(row["IRPJ+CSLL"], 24);
    assert.equal(row["Imp. oper. (R$)"], 41.1);
    assert.equal(row["Imp. oper. (%)"], 20.55);
    assert.equal(row["Imposto (R$)"], 65.1);
    assert.equal(row["Imposto (%)"], 32.55);
    assert.equal(row.Margem, 84.9);
    assert.equal(row["Incluído na apuração"], "Sim");
    assert.equal(row["Memória de cálculo"], "Linha 1\nLinha 2");
  });

  it("maps excluded sale with null tax values", () => {
    const [row] = buildSkuSalesExcelRows([
      includedRow({
        incluidoNaApuracao: false,
        impostoTotal: 0,
        margemLiquidaEstimada: 0,
        memoriaCalculo: ["Excluída"],
      }),
    ]);

    assert.equal(row["PIS/COFINS"], null);
    assert.equal(row.ICMS, null);
    assert.equal(row.DIFAL, null);
    assert.equal(row["IRPJ+CSLL"], null);
    assert.equal(row["Imp. oper. (R$)"], null);
    assert.equal(row["Imp. oper. (%)"], null);
    assert.equal(row["Imposto (R$)"], null);
    assert.equal(row["Imposto (%)"], null);
    assert.equal(row.Margem, null);
    assert.equal(row["Incluído na apuração"], "Não");
    assert.equal(row["Memória de cálculo"], "Excluída");
  });
});

describe("buildSkuSalesExcelFilename", () => {
  it("sanitizes sku and pads month", () => {
    assert.equal(
      buildSkuSalesExcelFilename({ sku: "SKU/A+B", year: 2026, month: 3 }),
      "relatorio-tributario-SKU_A_B-2026-03.xlsx",
    );
  });
});
