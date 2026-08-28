import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  impostoOperacionalLinha,
  skuImpostoOperacionalTotal,
  skuImpostoOperacionalMedio,
  skuImpostoOperacionalPercentual,
  margemOperacionalEstimadaLinha,
  margemOperacionalConsolidado,
  impostoOperacionalConsolidado,
} from "../imposto-operacional";
import type {
  DetalhamentoTributario,
  SkuAggregation,
  RelatorioConsolidado,
} from "../types";

function det(overrides: {
  incluido?: boolean;
  pisCofinsLiquido?: number;
  icmsTotal?: number;
  creditoCompra?: number;
  creditoOutras?: number;
}): DetalhamentoTributario {
  return {
    incluidoNaApuracao: overrides.incluido ?? true,
    pisCofins: { liquido: overrides.pisCofinsLiquido ?? 0 },
    icmsDifal: { icmsTotal: overrides.icmsTotal ?? 0 },
    icmsCreditoCompra: { creditoTotal: overrides.creditoCompra ?? 0 },
    creditoOutrasDespesas: { creditoTotal: overrides.creditoOutras ?? 0 },
  } as unknown as DetalhamentoTributario;
}

describe("impostoOperacionalLinha", () => {
  it("returns null when the transaction isn't included in the apuração", () => {
    assert.equal(impostoOperacionalLinha(det({ incluido: false })), null);
  });

  it("sums pisCofins + icms and subtracts purchase/other credits", () => {
    const result = impostoOperacionalLinha(
      det({ pisCofinsLiquido: 10, icmsTotal: 5, creditoCompra: 2, creditoOutras: 1 }),
    );
    assert.equal(result, 12);
  });

  it("treats missing sub-breakdowns as zero", () => {
    const row = {
      incluidoNaApuracao: true,
      pisCofins: null,
      icmsDifal: null,
      icmsCreditoCompra: null,
      creditoOutrasDespesas: null,
    } as unknown as DetalhamentoTributario;
    assert.equal(impostoOperacionalLinha(row), 0);
  });
});

function sku(overrides: Partial<SkuAggregation> & { transacoes?: DetalhamentoTributario[] } = {}): SkuAggregation {
  return {
    sku: "SKU-1",
    quantidadeVendas: 0,
    unidadesVendidas: 0,
    receitaTotal: 0,
    impostoTotal: 0,
    impostoMedioPorVenda: 0,
    impostoMedioPercentual: 0,
    transacoes: [],
    ...overrides,
  } as unknown as SkuAggregation;
}

describe("skuImpostoOperacionalTotal", () => {
  it("uses the precomputed field when present", () => {
    assert.equal(skuImpostoOperacionalTotal(sku({ impostoOperacionalTotal: 999 })), 999);
  });

  it("falls back to summing transacoes when not precomputed", () => {
    const result = skuImpostoOperacionalTotal(
      sku({
        transacoes: [
          det({ pisCofinsLiquido: 10 }),
          det({ pisCofinsLiquido: 5, incluido: false }),
        ],
      }),
    );
    assert.equal(result, 10);
  });
});

describe("skuImpostoOperacionalMedio", () => {
  it("uses the precomputed field when present", () => {
    assert.equal(skuImpostoOperacionalMedio(sku({ impostoOperacionalMedioPorVenda: 42 })), 42);
  });

  it("returns 0 when there were no sales", () => {
    assert.equal(skuImpostoOperacionalMedio(sku({ quantidadeVendas: 0 })), 0);
  });

  it("divides total by quantidadeVendas", () => {
    const result = skuImpostoOperacionalMedio(
      sku({
        quantidadeVendas: 2,
        transacoes: [det({ pisCofinsLiquido: 10 }), det({ pisCofinsLiquido: 10 })],
      }),
    );
    assert.equal(result, 10);
  });
});

describe("skuImpostoOperacionalPercentual", () => {
  it("uses the precomputed field when present", () => {
    assert.equal(
      skuImpostoOperacionalPercentual(sku({ impostoOperacionalMedioPercentual: 7 })),
      7,
    );
  });

  it("returns 0 when receitaTotal is 0", () => {
    assert.equal(skuImpostoOperacionalPercentual(sku({ receitaTotal: 0 })), 0);
  });

  it("computes imposto / receita * 100", () => {
    const result = skuImpostoOperacionalPercentual(
      sku({ receitaTotal: 200, transacoes: [det({ pisCofinsLiquido: 20 })] }),
    );
    assert.equal(result, 10);
  });
});

describe("margemOperacionalEstimadaLinha", () => {
  it("prefers margemOperacionalEstimada", () => {
    const row = {
      margemOperacionalEstimada: 15,
      margemLiquidaEstimada: 5,
    } as unknown as DetalhamentoTributario;
    assert.equal(margemOperacionalEstimadaLinha(row), 15);
  });

  it("falls back to the deprecated margemLiquidaEstimada field", () => {
    const row = {
      margemOperacionalEstimada: undefined,
      margemLiquidaEstimada: 5,
    } as unknown as DetalhamentoTributario;
    assert.equal(margemOperacionalEstimadaLinha(row), 5);
  });

  it("defaults to 0 when neither is set", () => {
    assert.equal(margemOperacionalEstimadaLinha({} as DetalhamentoTributario), 0);
  });
});

describe("margemOperacionalConsolidado", () => {
  it("prefers margemOperacional over the deprecated margemLiquida", () => {
    const consolidado = {
      margemOperacional: 30,
      margemLiquida: 10,
    } as unknown as RelatorioConsolidado;
    assert.equal(margemOperacionalConsolidado(consolidado), 30);
  });

  it("falls back to margemLiquida when margemOperacional is absent", () => {
    const consolidado = { margemLiquida: 10 } as unknown as RelatorioConsolidado;
    assert.equal(margemOperacionalConsolidado(consolidado), 10);
  });

  it("defaults to 0 when neither is set", () => {
    assert.equal(margemOperacionalConsolidado({} as RelatorioConsolidado), 0);
  });
});

describe("impostoOperacionalConsolidado", () => {
  it("sums pisCofinsLiquido and icmsDifalTotal, without IRPJ/CSLL", () => {
    const consolidado = {
      pisCofinsLiquido: 100,
      icmsDifalTotal: 50,
    } as unknown as RelatorioConsolidado;
    assert.equal(impostoOperacionalConsolidado(consolidado), 150);
  });
});
