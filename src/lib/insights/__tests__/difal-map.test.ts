import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDifalMap } from "../difal-map";
import type { TaxReportPayload, DetalhamentoTributario } from "@/lib/tax-report/types";

function det(overrides: {
  uf: string | null;
  receita: number;
  quantidade: number;
  margem: number;
  incluido?: boolean;
}): DetalhamentoTributario {
  return {
    transacao: {
      ufDestino: overrides.uf,
      receitaBruta: overrides.receita,
      quantidade: overrides.quantidade,
    },
    margemOperacionalEstimada: overrides.margem,
    incluidoNaApuracao: overrides.incluido ?? true,
  } as unknown as DetalhamentoTributario;
}

function payload(porSkuTransacoes: DetalhamentoTributario[][]): TaxReportPayload {
  return {
    porSku: porSkuTransacoes.map((transacoes, i) => ({
      sku: `SKU-${i}`,
      transacoes,
    })),
  } as unknown as TaxReportPayload;
}

describe("buildDifalMap", () => {
  it("aggregates revenue/units/margin by destination UF", () => {
    const result = buildDifalMap(
      payload([
        [
          det({ uf: "SP", receita: 100, quantidade: 2, margem: 20 }),
          det({ uf: "SP", receita: 50, quantidade: 1, margem: 5 }),
        ],
        [det({ uf: "RJ", receita: 200, quantidade: 3, margem: 40 })],
      ]),
    );

    const sp = result.find((r) => r.uf === "SP");
    assert.ok(sp);
    assert.equal(sp.receitaTotal, 150);
    assert.equal(sp.unidades, 3);
    assert.equal(sp.totalTransacoes, 2);
    assert.equal(sp.margemMedia, ((20 + 5) / 150) * 100);
  });

  it("skips transactions not included in the apuração", () => {
    const result = buildDifalMap(
      payload([[det({ uf: "SP", receita: 100, quantidade: 1, margem: 10, incluido: false })]]),
    );
    assert.deepEqual(result, []);
  });

  it("skips transactions without a destination UF", () => {
    const result = buildDifalMap(
      payload([[det({ uf: null, receita: 100, quantidade: 1, margem: 10 })]]),
    );
    assert.deepEqual(result, []);
  });

  it("sorts by total revenue descending", () => {
    const result = buildDifalMap(
      payload([
        [det({ uf: "SP", receita: 50, quantidade: 1, margem: 5 })],
        [det({ uf: "RJ", receita: 500, quantidade: 1, margem: 5 })],
      ]),
    );
    assert.deepEqual(
      result.map((r) => r.uf),
      ["RJ", "SP"],
    );
  });

  it("falls back to root-level transacoes when porSku transactions are empty", () => {
    const rootPayload = {
      porSku: [{ sku: "SKU-0", transacoes: [] }],
      transacoes: [det({ uf: "MG", receita: 80, quantidade: 2, margem: 8 })],
    } as unknown as TaxReportPayload;
    const result = buildDifalMap(rootPayload);
    assert.equal(result.length, 1);
    assert.equal(result[0].uf, "MG");
  });

  it("returns an empty array when there's nothing to aggregate", () => {
    assert.deepEqual(buildDifalMap(payload([])), []);
  });
});
