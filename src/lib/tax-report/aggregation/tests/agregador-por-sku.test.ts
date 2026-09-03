import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  agregarPorSku,
  consolidarRelatorio,
} from "@/lib/tax-report/aggregation/agregador-por-sku";
import type { DetalhamentoTributario } from "@/lib/tax-report/types";

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
      isMonophasic: false,
      saleFee: 0,
      freightCost: 0,
      ipiPercent: 0,
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
      pisRatePercent: 1.65,
      cofinsRatePercent: 7.6,
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
    creditoOutrasDespesas: null,
    cbsIbs: null,
    impostoTotal: 6.5,
    margemOperacionalEstimada: receita - 10 - 6.5,
    incluidoNaApuracao: true,
    memoriaCalculo: [],
  };
}

describe("agregarPorSku", () => {
  it("groups transactions by exact sku, without merging distinct skus", () => {
    const rows = agregarPorSku([detalhe("SKU-A", 100), detalhe("SKU-B", 200)]);

    assert.equal(rows.length, 2);
    const byB = rows.find((r) => r.sku === "SKU-B");
    const byA = rows.find((r) => r.sku === "SKU-A");
    assert.equal(byA?.receitaTotal, 100);
    assert.equal(byB?.receitaTotal, 200);
  });

  it("sums multiple transactions with the same sku into one row", () => {
    const rows = agregarPorSku([detalhe("SKU-A", 100), detalhe("SKU-A", 200)]);

    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.sku, "SKU-A");
    assert.equal(rows[0]?.receitaTotal, 300);
    assert.equal(rows[0]?.quantidadeVendas, 2);
  });
});

function detalheComCustosFixos(
  sku: string,
  receita: number,
  custosFixosCredito: number,
): DetalhamentoTributario {
  const base = detalhe(sku, receita);
  return {
    ...base,
    creditoOutrasDespesas: {
      meliFee: { base: 0, aliquotaPercent: 9.25, credito: 0 },
      ads: { base: 0, aliquotaPercent: 9.25, credito: 0, gastoAdsMesItem: 0, receitaMesItem: 0 },
      frete: { base: 0, aliquotaPercent: 9.25, credito: 0 },
      custosFixos: {
        base: custosFixosCredito / 0.0925,
        aliquotaPercent: 9.25,
        credito: custosFixosCredito,
        custosFixosMesTotal: 800,
        receitaMesTotal: 1000,
      },
      creditoTotal: custosFixosCredito,
    },
  };
}

describe("consolidarRelatorio — crédito de custos fixos", () => {
  it("derives creditoCustosFixosTotal from per-transaction custosFixos credit, subtracted once (not double-counted)", () => {
    const semCredito = consolidarRelatorio([detalhe("SKU-A", 100)]);
    const comCredito = consolidarRelatorio(
      [detalheComCustosFixos("SKU-A", 100, 74)],
      {
        creditoCustosFixosBaseRegistrada: 800,
        creditoCustosFixosBaseCreditavel: 800,
      },
    );

    assert.equal(comCredito.creditoCustosFixosTotal, 74);
    assert.equal(comCredito.creditoCustosFixosBaseRegistrada, 800);
    assert.equal(comCredito.creditoCustosFixosBaseCreditavel, 800);
    // creditoOutrasDespesasTotal já inclui os 74 — impostosOperacionais só subtrai uma vez.
    assert.equal(
      comCredito.margemOperacional,
      Math.round((semCredito.margemOperacional + 74) * 100) / 100,
    );
  });

  it("defaults to zero when no fixed cost credit is provided", () => {
    const result = consolidarRelatorio([detalhe("SKU-A", 100)]);
    assert.equal(result.creditoCustosFixosTotal, 0);
  });
});
