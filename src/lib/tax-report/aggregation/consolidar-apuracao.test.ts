import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { consolidarApuracao } from "@/lib/tax-report/aggregation/consolidar-apuracao";
import type { DetalhamentoTributario } from "@/lib/tax-report/types";

function detalhe(
  overrides: Partial<DetalhamentoTributario> = {},
): DetalhamentoTributario {
  return {
    transacao: {
      transactionKey: "1",
      orderId: "1",
      orderDate: "2026-05-01",
      sku: "A",
      itemId: "MLB",
      quantidade: 1,
      receitaBruta: 100,
      ufDestino: "RJ",
      tipoDocumento: "CPF",
      documento: null,
      contribuinteIcms: false,
      contribuinteSource: null,
      dadosFiscaisIndisponiveis: false,
      custoAquisicaoUnitario: 50,
      unitCostNf: 60,
      purchaseIcmsPercent: 18,
      hasIcmsSt: false,
      saleIcmsPercent: 18,
      extraCostsUnitario: 0,
      mercadoriaImportada: false,
      conteudoImportacaoPercentual: 0,
      isMonophasic: false,
      saleFee: 0,
      ipiPercent: 0,
    },
    pisCofins: {
      baseDebito: 88,
      baseCredito: 49.2,
      pisDebito: 1.45,
      cofinsDebito: 6.69,
      debitoTotal: 8.14,
      pisCredito: 0.81,
      cofinsCredito: 3.74,
      creditoTotal: 4.55,
      liquido: 3.59,
      icmsExcluidoDaBase: 12,
      excludedIcmsFromBase: true,
      pisRatePercent: 1.65,
      cofinsRatePercent: 7.6,
    },
    icmsDifal: {
      ufOrigem: "SP",
      ufDestino: "RJ",
      aliquotaInterestadual: 0.12,
      aliquotaInternaTotal: 0.2,
      icmsInterestadual: 12,
      difal: 8,
      icmsTotal: 20,
      isContribuinte: false,
      isOperacaoInterna: false,
    },
    icmsCreditoCompra: {
      baseUnitaria: 60,
      aliquotaPercent: 18,
      creditoTotal: 10.8,
    },
    creditoOutrasDespesas: null,
    cbsIbs: null,
    impostoTotal: 23.59,
    margemOperacionalEstimada: 26.41,
    incluidoNaApuracao: true,
    memoriaCalculo: [],
    ...overrides,
  };
}

describe("consolidarApuracao", () => {
  it("aggregates debito, credito and difal por UF", () => {
    const apuracao = consolidarApuracao([detalhe()]);
    assert.equal(apuracao.pis.debito, 1.45);
    assert.equal(apuracao.pis.credito, 0.81);
    assert.equal(apuracao.cofins.debito, 6.69);
    assert.equal(apuracao.icms.debito, 20);
    assert.equal(apuracao.icms.credito, 10.8);
    assert.equal(apuracao.icms.icmsSemDifalDebito, 12);
    assert.equal(apuracao.icms.difalDebito, 8);
    assert.equal(apuracao.icmsARecolherSpEstimado, 1.2);
    assert.equal(apuracao.difalPorUf.RJ, 8);
    assert.equal(apuracao.diagnostico.linhasSemCustoCadastrado, 0);
  });

  it("sums stRecuperavelTotal into icmsStRecuperavelEstimado", () => {
    const comRecuperacao = detalhe({
      transacao: { ...detalhe().transacao, hasIcmsSt: true },
      icmsCreditoCompra: {
        baseUnitaria: 0,
        aliquotaPercent: 0,
        creditoTotal: 15,
        stRecuperavelTotal: 15,
      },
    });
    const apuracao = consolidarApuracao([detalhe(), comRecuperacao]);
    assert.equal(apuracao.icmsStRecuperavelEstimado, 15);
    assert.equal(apuracao.icms.credito, 25.8);
  });

  it("flags lines without unitCostNf", () => {
    const semCusto = detalhe({
      transacao: {
        ...detalhe().transacao,
        unitCostNf: null,
        receitaBruta: 50,
      },
      pisCofins: {
        baseDebito: 50,
        baseCredito: 0,
        pisDebito: 0.83,
        cofinsDebito: 3.8,
        debitoTotal: 4.63,
        pisCredito: 0,
        cofinsCredito: 0,
        creditoTotal: 0,
        liquido: 4.63,
        icmsExcluidoDaBase: 0,
        excludedIcmsFromBase: true,
        pisRatePercent: 1.65,
        cofinsRatePercent: 7.6,
      },
      icmsCreditoCompra: {
        baseUnitaria: 0,
        aliquotaPercent: 0,
        creditoTotal: 0,
      },
    });
    const apuracao = consolidarApuracao([detalhe(), semCusto]);
    assert.equal(apuracao.diagnostico.linhasSemCustoCadastrado, 1);
    assert.equal(apuracao.diagnostico.receitaSemCustoCadastrado, 50);
    assert.ok(apuracao.diagnostico.creditoPisCofinsPerdidoEstimado > 0);
  });
});
