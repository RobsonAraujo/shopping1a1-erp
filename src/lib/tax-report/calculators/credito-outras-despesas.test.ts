import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ADS_CREDIT_RATE,
  MELI_FEE_CREDIT_RATE,
  calcularCreditoAds,
  calcularCreditoMeliFee,
  calcularCreditoOutrasDespesas,
} from "@/lib/tax-report/calculators/credito-outras-despesas";

describe("calcularCreditoMeliFee", () => {
  it("credita 9,25% sobre a tarifa de venda", () => {
    const result = calcularCreditoMeliFee(20);
    assert.equal(result.base, 20);
    assert.equal(result.aliquotaPercent, MELI_FEE_CREDIT_RATE * 100);
    assert.equal(result.credito, 1.85);
  });

  it("retorna zero quando não há tarifa", () => {
    const result = calcularCreditoMeliFee(0);
    assert.equal(result.base, 0);
    assert.equal(result.credito, 0);
  });

  it("ignora valores inválidos", () => {
    const result = calcularCreditoMeliFee(-5);
    assert.equal(result.base, 0);
    assert.equal(result.credito, 0);
  });
});

describe("calcularCreditoAds", () => {
  it("rateia o gasto de ads do mês proporcionalmente à receita da venda", () => {
    const result = calcularCreditoAds({
      receitaBrutaVenda: 100,
      receitaTotalItemMes: 1000,
      gastoAdsTotalItemMes: 200,
    });
    // proporção 10% do gasto do mês => 20; crédito 9,25% de 20 = 1.85
    assert.equal(result.base, 20);
    assert.equal(result.aliquotaPercent, ADS_CREDIT_RATE * 100);
    assert.equal(result.credito, 1.85);
    assert.equal(result.gastoAdsMesItem, 200);
    assert.equal(result.receitaMesItem, 1000);
  });

  it("retorna zero quando não há receita do item no mês", () => {
    const result = calcularCreditoAds({
      receitaBrutaVenda: 100,
      receitaTotalItemMes: 0,
      gastoAdsTotalItemMes: 200,
    });
    assert.equal(result.base, 0);
    assert.equal(result.credito, 0);
  });

  it("retorna zero quando não há gasto em ads no mês", () => {
    const result = calcularCreditoAds({
      receitaBrutaVenda: 100,
      receitaTotalItemMes: 1000,
      gastoAdsTotalItemMes: 0,
    });
    assert.equal(result.base, 0);
    assert.equal(result.credito, 0);
  });
});

describe("calcularCreditoOutrasDespesas", () => {
  it("soma o crédito de tarifa Meli e de ads", () => {
    const result = calcularCreditoOutrasDespesas({
      saleFee: 20,
      receitaBrutaVenda: 100,
      receitaTotalItemMes: 1000,
      gastoAdsTotalItemMes: 200,
    });
    assert.equal(result.meliFee.credito, 1.85);
    assert.equal(result.ads.credito, 1.85);
    assert.equal(result.creditoTotal, 3.7);
  });

  it("funciona sem ads ativo (apenas tarifa Meli)", () => {
    const result = calcularCreditoOutrasDespesas({
      saleFee: 20,
      receitaBrutaVenda: 100,
      receitaTotalItemMes: 0,
      gastoAdsTotalItemMes: 0,
    });
    assert.equal(result.ads.credito, 0);
    assert.equal(result.creditoTotal, 1.85);
  });
});
