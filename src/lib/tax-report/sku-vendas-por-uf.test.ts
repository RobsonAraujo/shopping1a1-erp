import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calcularSkuVendasPorUf,
  skuVendaPorUfFilterValue,
} from "@/lib/tax-report/sku-vendas-por-uf";
import type { DetalhamentoTributario } from "@/lib/tax-report/types";

function detalhe(
  ufDestino: string | null,
  receitaBruta: number,
  quantidade = 1,
): DetalhamentoTributario {
  return {
    transacao: {
      transactionKey: `${ufDestino ?? "x"}-${receitaBruta}`,
      orderId: "1",
      orderDate: "2026-05-01",
      sku: "A",
      itemId: "MLB",
      quantidade,
      receitaBruta,
      ufDestino,
      tipoDocumento: "CPF",
      documento: null,
      contribuinteIcms: null,
      contribuinteSource: null,
      dadosFiscaisIndisponiveis: false,
      custoAquisicaoUnitario: null,
      unitCostNf: null,
      purchaseIcmsPercent: 0,
      hasIcmsSt: false,
      saleIcmsPercent: 0,
      extraCostsUnitario: 0,
      mercadoriaImportada: false,
      conteudoImportacaoPercentual: 0,
      isMonophasic: false,
    },
    pisCofins: null,
    icmsDifal: null,
    icmsCreditoCompra: null,
    cbsIbs: null,
    impostoTotal: 0,
    margemOperacionalEstimada: 0,
    incluidoNaApuracao: true,
    memoriaCalculo: [],
  };
}

describe("calcularSkuVendasPorUf", () => {
  it("groups revenue by UF and computes share of total", () => {
    const rows = calcularSkuVendasPorUf([
      detalhe("SP", 200),
      detalhe("SP", 100),
      detalhe("PI", 50),
      detalhe(null, 50),
    ]);

    assert.equal(rows.length, 3);
    assert.equal(rows[0]?.uf, "SP");
    assert.equal(rows[0]?.percentualReceita, 75);
    assert.equal(rows[0]?.quantidadeVendas, 2);
    assert.equal(rows[1]?.uf, "PI");
    assert.equal(rows[1]?.percentualReceita, 12.5);
    assert.equal(rows[2]?.uf, "Sem UF");
    assert.equal(rows[2]?.percentualReceita, 12.5);
    assert.equal(
      rows.reduce((sum, row) => sum + row.percentualReceita, 0),
      100,
    );
  });

  it("returns empty list without transactions", () => {
    assert.deepEqual(calcularSkuVendasPorUf([]), []);
  });
});

describe("skuVendaPorUfFilterValue", () => {
  it("maps Sem UF to empty filter", () => {
    assert.equal(skuVendaPorUfFilterValue("Sem UF"), "");
    assert.equal(skuVendaPorUfFilterValue("SP"), "SP");
  });
});
