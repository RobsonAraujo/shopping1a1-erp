import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calcularDetalhamentoTransacao } from "@/lib/tax-report/service/compute-report";
import type {
  IcmsRateRow,
  TaxCompanyConfig,
  TransacaoVenda,
} from "@/lib/tax-report/types";

/**
 * O exemplo do plano do incentivo (venda SP→SP de R$ 100, compra de R$ 50 com
 * 12% de ICMS na nota): o ICMS a pagar cai de R$ 12 para R$ 6, a base do
 * PIS/COFINS sobe de 82 para 88, e o imposto da venda vai de 14,95% a 9,51%
 * (o plano dizia 14,96 com 9,25% de uma vez; o motor arredonda PIS e COFINS
 * separados).
 */
const config: TaxCompanyConfig = {
  taxRegime: "LUCRO_REAL",
  originUf: "SP",
  pisRatePercent: 1.65,
  cofinsRatePercent: 7.6,
  excludeIcmsFromPisCofinsBase: true,
  considerIcmsStRecuperavel: true,
  simplesAliquotaEfetivaPercent: null,
};

const icmsRates = new Map<string, IcmsRateRow>([
  ["SP", { uf: "SP", aliquotaBase: 0.18, fcp: 0 }],
]);

function venda(overrides: Partial<TransacaoVenda> = {}): TransacaoVenda {
  return {
    transactionKey: "1-MLB1-SKU1",
    orderId: "1",
    orderDate: "2026-11-10T12:00:00.000-03:00",
    sku: "SKU1",
    itemId: "MLB1",
    quantidade: 1,
    receitaBruta: 100,
    ufDestino: "SP",
    tipoDocumento: "CPF",
    documento: null,
    contribuinteIcms: false,
    contribuinteSource: null,
    dadosFiscaisIndisponiveis: false,
    custoAquisicaoUnitario: 50,
    unitCostNf: 50,
    purchaseIcmsPercent: 12,
    hasIcmsSt: false,
    saleIcmsPercent: 0,
    extraCostsUnitario: 0,
    mercadoriaImportada: false,
    isMonophasic: false,
    saleFee: 0,
    freightCost: 0,
    ipiPercent: 0,
    ...overrides,
  };
}

function detalhe(transacao: TransacaoVenda) {
  return calcularDetalhamentoTransacao({
    transacao,
    config,
    icmsRates,
    cbsIbsVigencia: null,
    year: 2026,
    incluirNaApuracao: true,
  });
}

describe("incentivo de ICMS no imposto da venda", () => {
  it("sem incentivo: ICMS 18 − 6 = 12; PIS/COFINS sobre 82; total 14,95", () => {
    const d = detalhe(venda());
    assert.equal(d.icmsDifal?.icmsTotal, 18);
    assert.equal(d.icmsCreditoCompra?.creditoTotal, 6);
    assert.equal(d.pisCofins?.baseDebito, 82);
    assert.equal(d.impostoTotal, 14.95);
  });

  it("com incentivo de 12%: ICMS 12 − 6 = 6; PIS/COFINS sobre 88; total 9,51", () => {
    const d = detalhe(
      venda({ incentivoIcms: { ncm: "85163100", aliquotaPercent: 12, appliesTo: "all" } }),
    );
    assert.equal(d.icmsDifal?.icmsTotal, 12);
    // Crédito da compra não muda: é o ICMS de compra do cadastro, integral.
    assert.equal(d.icmsCreditoCompra?.creditoTotal, 6);
    assert.equal(d.pisCofins?.baseDebito, 88);
    assert.equal(d.impostoTotal, 9.51);
  });
});
