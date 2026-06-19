import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { agregarPorSku } from "@/lib/tax-report/aggregation/agregador-por-sku";
import type { DetalhamentoTributario } from "@/lib/tax-report/types";

const aliasMap = new Map<string, string>([
  ["SKU-LEGADO", "SKU-ATUAL"],
]);

function detalhe(sku: string, receita: number): DetalhamentoTributario {
  return {
    transacao: {
      transactionKey: `${sku}-${receita}`,
      orderId: "1",
      orderDate: "2026-05-01",
      sku,
      itemId: "MLB",
      quantidade: 1,
      receitaBruta: receita,
      ufDestino: "SP",
      tipoDocumento: "CPF",
      documento: null,
      contribuinteIcms: null,
      contribuinteSource: null,
      dadosFiscaisIndisponiveis: false,
      custoAquisicaoUnitario: 10,
      unitCostNf: 12,
      purchaseIcmsPercent: 18,
      hasIcmsSt: false,
      saleIcmsPercent: 18,
      extraCostsUnitario: 0,
      mercadoriaImportada: false,
      conteudoImportacaoPercentual: 0,
      isMonophasic: false,
    },
    pisCofins: {
      baseDebito: receita,
      baseCredito: 10,
      pisDebito: 1,
      cofinsDebito: 2,
      debitoTotal: 3,
      pisCredito: 0.5,
      cofinsCredito: 1,
      creditoTotal: 1.5,
      liquido: 1.5,
      icmsExcluidoDaBase: 0,
      excludedIcmsFromBase: false,
    },
    icmsDifal: {
      ufOrigem: "SP",
      ufDestino: "SP",
      aliquotaInterestadual: 0.12,
      aliquotaInternaTotal: 0.18,
      icmsInterestadual: 0,
      difal: 0,
      icmsTotal: 5,
      isContribuinte: false,
      isOperacaoInterna: true,
    },
    icmsCreditoCompra: null,
    cbsIbs: null,
    impostoTotal: 6.5,
    margemOperacionalEstimada: receita - 10 - 6.5,
    incluidoNaApuracao: true,
    memoriaCalculo: [],
  };
}

describe("agregarPorSku with aliases", () => {
  it("merges legacy and canonical sku into one row preserving original sku on lines", () => {
    const rows = agregarPorSku(
      [detalhe("SKU-LEGADO", 100), detalhe("SKU-ATUAL", 200)],
      aliasMap,
    );

    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.sku, "SKU-ATUAL");
    assert.deepEqual(rows[0]?.skuAliases, ["SKU-LEGADO"]);
    assert.equal(rows[0]?.receitaTotal, 300);
    assert.equal(rows[0]?.quantidadeVendas, 2);
    assert.equal(rows[0]?.transacoes[0]?.transacao.sku, "SKU-LEGADO");
    assert.equal(rows[0]?.transacoes[1]?.transacao.sku, "SKU-ATUAL");
  });
});
