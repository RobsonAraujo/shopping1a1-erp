import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aliquotaInternaTotal,
  calcularIcmsDifal,
  icmsSemDifal,
  obterAliquotaIcmsSaidaInterna,
  obterAliquotaInterestadual,
} from "@/lib/tax-report/calculators/icms-difal";
import type { IcmsRateRow, TransacaoVenda } from "@/lib/tax-report/types";

function baseTransacao(
  overrides: Partial<TransacaoVenda> = {},
): TransacaoVenda {
  return {
    transactionKey: "1-SKU",
    orderId: "1",
    orderDate: "2026-01-15T12:00:00.000Z",
    sku: "SKU1",
    itemId: "MLB1",
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
    isMonophasic: false,
    saleFee: 0,
    ipiPercent: 0,
    ...overrides,
  };
}

const rates = new Map<string, IcmsRateRow>([
  ["SP", { uf: "SP", aliquotaBase: 0.18, fcp: 0 }],
  ["RJ", { uf: "RJ", aliquotaBase: 0.2, fcp: 0.02 }],
  ["PA", { uf: "PA", aliquotaBase: 0.17, fcp: 0 }],
]);

describe("obterAliquotaInterestadual", () => {
  it("SP to RJ national = 12%", () => {
    assert.equal(
      obterAliquotaInterestadual({
        ufDestino: "RJ",
        ufOrigem: "SP",
        mercadoriaImportada: false,
      }),
      0.12,
    );
  });

  it("SP to PA = 7%", () => {
    assert.equal(
      obterAliquotaInterestadual({
        ufDestino: "PA",
        ufOrigem: "SP",
        mercadoriaImportada: false,
      }),
      0.07,
    );
  });

  it("imported = 4% any destination", () => {
    assert.equal(
      obterAliquotaInterestadual({
        ufDestino: "RJ",
        ufOrigem: "SP",
        mercadoriaImportada: true,
      }),
      0.04,
    );
  });
});

describe("calcularIcmsDifal", () => {
  it("SP to RJ PF national: interstate 12%, DIFAL = internal - 12%", () => {
    const result = calcularIcmsDifal({
      transacao: baseTransacao({ ufDestino: "RJ", tipoDocumento: "CPF" }),
      ufOrigem: "SP",
      rates,
    });
    assert.ok(result);
    assert.equal(result.aliquotaInterestadual, 0.12);
    assert.equal(result.icmsInterestadual, 12);
    const interna = aliquotaInternaTotal("RJ", rates);
    assert.equal(result.difal, 100 * (interna - 0.12));
    assert.equal(result.isContribuinte, false);
  });

  it("SP to PA PJ contributor via ML: 7% interstate, no DIFAL", () => {
    const result = calcularIcmsDifal({
      transacao: baseTransacao({
        ufDestino: "PA",
        tipoDocumento: "CNPJ",
        contribuinteIcms: true,
        contribuinteSource: "ml_taxpayer_type",
      }),
      ufOrigem: "SP",
      rates,
    });
    assert.ok(result);
    assert.equal(result.aliquotaInterestadual, 0.07);
    assert.equal(result.icmsInterestadual, 7);
    assert.equal(result.difal, 0);
    assert.equal(result.isContribuinte, true);
  });

  it("SP to SP: internal rate only", () => {
    const result = calcularIcmsDifal({
      transacao: baseTransacao({ ufDestino: "SP", saleIcmsPercent: 18 }),
      ufOrigem: "SP",
      rates,
    });
    assert.ok(result);
    assert.equal(result.isOperacaoInterna, true);
    assert.equal(result.icmsTotal, 18);
    assert.equal(result.difal, 0);
    assert.equal(result.aliquotaSaidaEfetiva, 0.18);
  });

  it("SP to SP with ICMS-ST: ICMS na saída sempre 0%", () => {
    const result = calcularIcmsDifal({
      transacao: baseTransacao({
        ufDestino: "SP",
        hasIcmsSt: true,
        saleIcmsPercent: 0,
      }),
      ufOrigem: "SP",
      rates,
    });
    assert.ok(result);
    assert.equal(result.icmsTotal, 0);
    assert.equal(result.icmsStNaCompra, true);
    assert.equal(result.aliquotaSaidaEfetiva, 0);
  });

  it("SP to SP com ICMS-ST ignora saleIcmsPercent (sempre 0%)", () => {
    const result = calcularIcmsDifal({
      transacao: baseTransacao({
        ufDestino: "SP",
        receitaBruta: 100,
        hasIcmsSt: true,
        saleIcmsPercent: 3,
      }),
      ufOrigem: "SP",
      rates,
    });
    assert.ok(result);
    assert.equal(result.icmsTotal, 0);
    assert.equal(result.aliquotaSaidaEfetiva, 0);
  });

  it("SP to SP sem ST usa tabela UF (ignora saleIcmsPercent zerado)", () => {
    const result = calcularIcmsDifal({
      transacao: baseTransacao({
        ufDestino: "SP",
        hasIcmsSt: false,
        saleIcmsPercent: 0,
      }),
      ufOrigem: "SP",
      rates,
    });
    assert.ok(result);
    assert.equal(result.icmsTotal, 18);
    assert.equal(result.aliquotaSaidaEfetiva, 0.18);
  });

  it("SP to SP sem ST ignora saleIcmsPercent mesmo quando não-zero", () => {
    const result = calcularIcmsDifal({
      transacao: baseTransacao({
        ufDestino: "SP",
        hasIcmsSt: false,
        saleIcmsPercent: 12,
      }),
      ufOrigem: "SP",
      rates,
    });
    assert.ok(result);
    assert.equal(result.icmsTotal, 18);
    assert.equal(result.aliquotaSaidaEfetiva, 0.18);
  });

  it("imported non-contributor: interstate 4%, DIFAL = internal - 4%", () => {
    const result = calcularIcmsDifal({
      transacao: baseTransacao({
        ufDestino: "RJ",
        mercadoriaImportada: true,
      }),
      ufOrigem: "SP",
      rates,
    });
    assert.ok(result);
    assert.equal(result.aliquotaInterestadual, 0.04);
    assert.equal(result.icmsInterestadual, 4);
    const interna = aliquotaInternaTotal("RJ", rates);
    assert.equal(result.difal, 100 * (interna - 0.04));
  });
});

describe("obterAliquotaIcmsSaidaInterna", () => {
  it("ST sempre 0% independente de saleIcmsPercent", () => {
    assert.equal(
      obterAliquotaIcmsSaidaInterna(
        baseTransacao({ hasIcmsSt: true, saleIcmsPercent: 0 }),
        0.18,
      ),
      0,
    );
    assert.equal(
      obterAliquotaIcmsSaidaInterna(
        baseTransacao({ hasIcmsSt: true, saleIcmsPercent: 3 }),
        0.18,
      ),
      0,
    );
  });

  it("sem ST usa tabela UF independente de saleIcmsPercent", () => {
    assert.equal(
      obterAliquotaIcmsSaidaInterna(
        baseTransacao({ hasIcmsSt: false, saleIcmsPercent: 0 }),
        0.18,
      ),
      0.18,
    );
    assert.equal(
      obterAliquotaIcmsSaidaInterna(
        baseTransacao({ hasIcmsSt: false, saleIcmsPercent: 12 }),
        0.18,
      ),
      0.18,
    );
  });
});

describe("icmsSemDifal", () => {
  it("returns icmsTotal minus difal", () => {
    const result = calcularIcmsDifal({
      transacao: baseTransacao({ ufDestino: "RJ", tipoDocumento: "CPF" }),
      ufOrigem: "SP",
      rates,
    });
    assert.ok(result);
    assert.equal(icmsSemDifal(result), result.icmsInterestadual);
    assert.equal(icmsSemDifal(result) + result.difal, result.icmsTotal);
  });

  it("equals icmsTotal when difal is zero", () => {
    const result = calcularIcmsDifal({
      transacao: baseTransacao({ ufDestino: "SP" }),
      ufOrigem: "SP",
      rates,
    });
    assert.ok(result);
    assert.equal(icmsSemDifal(result), 18);
    assert.equal(result.difal, 0);
  });
});
