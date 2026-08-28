import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  avaliarProximidadeLimite,
  calcularAliquotaEfetivaNominal,
  calcularComposicaoDas,
  encontrarFaixaPorRbt12,
} from "../das-calculator";

describe("encontrarFaixaPorRbt12", () => {
  it("retorna faixa 1 para RBT12 zero ou baixo", () => {
    assert.equal(encontrarFaixaPorRbt12(0).faixa, 1);
    assert.equal(encontrarFaixaPorRbt12(100_000).faixa, 1);
  });

  it("retorna a faixa correta no limite superior de cada intervalo", () => {
    assert.equal(encontrarFaixaPorRbt12(180_000).faixa, 1);
    assert.equal(encontrarFaixaPorRbt12(180_000.01).faixa, 2);
    assert.equal(encontrarFaixaPorRbt12(360_000).faixa, 2);
    assert.equal(encontrarFaixaPorRbt12(360_000.01).faixa, 3);
  });

  it("retorna a última faixa (6) acima do teto", () => {
    assert.equal(encontrarFaixaPorRbt12(10_000_000).faixa, 6);
  });
});

describe("calcularAliquotaEfetivaNominal", () => {
  it("é igual à alíquota nominal quando RBT12 é zero", () => {
    const faixa = encontrarFaixaPorRbt12(0);
    assert.equal(calcularAliquotaEfetivaNominal(0, faixa), faixa.aliquotaNominalPercent);
  });

  it("aplica a fórmula (RBT12 × aliq − parcela) / RBT12 na faixa 2", () => {
    const faixa = encontrarFaixaPorRbt12(240_000);
    // (240000*0.073 - 5940) / 240000 * 100 = 4.825%
    assert.equal(calcularAliquotaEfetivaNominal(240_000, faixa), 4.83);
  });
});

describe("calcularComposicaoDas", () => {
  it("distribui o valor do DAS pelos percentuais da faixa e soma o total", () => {
    const faixa = encontrarFaixaPorRbt12(100_000);
    const composicao = calcularComposicaoDas(1000, faixa);
    const soma = Object.values(composicao).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(soma - 1000) < 0.01);
    assert.equal(composicao.icms, 340);
  });
});

describe("avaliarProximidadeLimite", () => {
  it("sinaliza 'danger' acima do teto", () => {
    const result = avaliarProximidadeLimite(4_900_000);
    assert.equal(result.tone, "danger");
  });

  it("sinaliza 'warning' acima do sublimite", () => {
    const result = avaliarProximidadeLimite(3_700_000);
    assert.equal(result.tone, "warning");
  });

  it("sinaliza 'ok' bem dentro de uma faixa", () => {
    const result = avaliarProximidadeLimite(50_000);
    assert.equal(result.tone, "ok");
  });

  it("sinaliza 'warning' perto do limite da faixa", () => {
    const result = avaliarProximidadeLimite(175_000);
    assert.equal(result.tone, "warning");
  });
});
