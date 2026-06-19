import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { slimTaxReportPayloadForStorage } from "@/lib/tax-report/service/snapshot-storage";
import type { TaxReportPayload } from "@/lib/tax-report/types";

function minimalPayload(): TaxReportPayload {
  return {
    year: 2026,
    month: 3,
    consolidado: {
      faturamento: 100,
      pisCofinsLiquido: 10,
      icmsDifalTotal: 5,
      irpjEstimado: 2,
      csllEstimado: 1,
      cbsIbsInformativoTotal: 0,
      margemLiquida: 80,
      transacoesIncluidas: 1,
      transacoesExcluidas: 0,
      transacoesSemBillingInfo: 0,
    },
    porSku: [
      {
        sku: "SKU-A",
        quantidadeVendas: 1,
        unidadesVendidas: 1,
        receitaTotal: 100,
        impostoTotal: 20,
        impostoMedioPorVenda: 20,
        impostoMedioPercentual: 20,
        transacoes: [
          {
            transacao: {
              transactionKey: "k1",
              orderId: "1",
              orderDate: "2026-03-01",
              sku: "SKU-A",
              itemId: "MLB1",
              quantidade: 1,
              receitaBruta: 100,
              ufDestino: "SP",
              tipoDocumento: "CPF",
              documento: null,
              contribuinteIcms: null,
              contribuinteSource: null,
              dadosFiscaisIndisponiveis: false,
              custoAquisicaoUnitario: 40,
              unitCostNf: 50,
              purchaseIcmsPercent: 18,
              hasIcmsSt: false,
              extraCostsUnitario: 0,
              mercadoriaImportada: false,
              conteudoImportacaoPercentual: 0,
              isMonophasic: false,
            },
            pisCofins: null,
            icmsDifal: null,
            icmsCreditoCompra: null,
            irpjCsll: null,
            cbsIbs: null,
            impostoTotal: 20,
            margemLiquidaEstimada: 40,
            incluidoNaApuracao: true,
            memoriaCalculo: ["linha"],
          },
        ],
      },
    ],
    transacoes: [
      {
        transacao: {
          transactionKey: "k1",
          orderId: "1",
          orderDate: "2026-03-01",
          sku: "SKU-A",
          itemId: "MLB1",
          quantidade: 1,
          receitaBruta: 100,
          ufDestino: "SP",
          tipoDocumento: "CPF",
          documento: null,
          contribuinteIcms: null,
          contribuinteSource: null,
          dadosFiscaisIndisponiveis: false,
          custoAquisicaoUnitario: 40,
          unitCostNf: 50,
          purchaseIcmsPercent: 18,
          hasIcmsSt: false,
          extraCostsUnitario: 0,
          mercadoriaImportada: false,
          conteudoImportacaoPercentual: 0,
          isMonophasic: false,
        },
        pisCofins: null,
        icmsDifal: null,
        icmsCreditoCompra: null,
        irpjCsll: null,
        cbsIbs: null,
        impostoTotal: 20,
        margemLiquidaEstimada: 40,
        incluidoNaApuracao: true,
        memoriaCalculo: ["linha"],
      },
    ],
    overrides: {},
    meta: {
      geradoEm: "2026-03-01T00:00:00.000Z",
      pedidosProcessados: 1,
      linhasProcessadas: 1,
      semBillingInfo: 0,
      duracaoMs: 100,
      taxRegime: "LUCRO_REAL",
      originUf: "SP",
    },
  };
}

describe("slimTaxReportPayloadForStorage", () => {
  it("clears root transacoes but keeps porSku transacoes", () => {
    const payload = minimalPayload();
    const slim = slimTaxReportPayloadForStorage(payload);

    assert.deepEqual(slim.transacoes, []);
    assert.equal(slim.porSku[0]?.transacoes.length, 1);
    assert.equal(slim.consolidado.faturamento, 100);
  });
});
