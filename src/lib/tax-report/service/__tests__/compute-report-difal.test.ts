import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTaxDailyTotals } from "@/lib/tax-report/aggregation/daily-totals";
import { impostoOperacionalLinhaValor } from "@/lib/tax-report/aggregation/agregador-por-sku";
import { difalCollectionKey, isDifalRecolhido } from "@/lib/tax-report/config";
import { impostoOperacionalLinha } from "@/lib/tax-report/imposto-operacional";
import {
  calcularDetalhamentoTransacao,
  calcularRelatorioFromTransacoes,
} from "@/lib/tax-report/service/compute-report";
import type {
  IcmsRateRow,
  TaxCompanyConfig,
  TaxReportPayload,
  TransacaoVenda,
} from "@/lib/tax-report/types";

/**
 * O exemplo do plano do DIFAL não recolhido: venda SP→RJ para CPF de R$ 100,
 * compra de R$ 50 com 12% de ICMS. Recolhendo, o imposto é R$ 18,59; sem
 * recolher o DIFAL do RJ, R$ 8,59 — exatamente os R$ 10 do DIFAL, com o
 * PIS/COFINS igual (o DIFAL continua fora da base).
 */
const base: TaxCompanyConfig = {
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
  ["RJ", { uf: "RJ", aliquotaBase: 0.2, fcp: 0.02 }],
  ["BA", { uf: "BA", aliquotaBase: 0.205, fcp: 0 }],
]);

function venda(overrides: Partial<TransacaoVenda> = {}): TransacaoVenda {
  return {
    transactionKey: "1-MLB1-SKU1",
    orderId: "1",
    orderDate: "2026-10-10T12:00:00.000-03:00",
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

function detalhe(transacao: TransacaoVenda, config: TaxCompanyConfig) {
  return calcularDetalhamentoTransacao({
    transacao,
    config,
    icmsRates,
    cbsIbsVigencia: null,
    year: 2026,
    incluirNaApuracao: true,
  });
}

const none: TaxCompanyConfig = { ...base, difalCollection: "none" };
const someRj: TaxCompanyConfig = {
  ...base,
  difalCollection: "some",
  difalCollectedUfs: ["RJ"],
};

describe("DIFAL não recolhido — venda SP→RJ para CPF", () => {
  it("recolhendo (padrão): ICMS 12 + DIFAL 10 − 6 = 16; imposto 18,59", () => {
    const d = detalhe(venda(), base);
    assert.equal(d.icmsDifal?.difal, 10);
    assert.equal(d.icmsDifal?.difalNaoRecolhido, undefined);
    assert.equal(d.pisCofins?.baseDebito, 78);
    assert.equal(d.impostoTotal, 18.59);
  });

  it("não recolhendo: DIFAL calculado e visível, fora do imposto (8,59)", () => {
    const d = detalhe(venda(), none);
    assert.equal(d.icmsDifal?.difal, 10);
    assert.equal(d.icmsDifal?.difalNaoRecolhido, true);
    // PIS/COFINS igual: o DIFAL continua excluído da base.
    assert.equal(d.pisCofins?.baseDebito, 78);
    assert.equal(d.impostoTotal, 8.59);
    assert.ok(d.memoriaCalculo.some((l) => l.includes("não recolhido")));
    assert.ok(d.memoriaCalculo.some((l) => l.includes("ICMS devido = R$ 12.00")));
  });

  it("só alguns estados: RJ marcado recolhe; BA não", () => {
    assert.equal(detalhe(venda(), someRj).impostoTotal, 18.59);
    const ba = detalhe(venda({ ufDestino: "BA" }), someRj);
    assert.equal(ba.icmsDifal?.difalNaoRecolhido, true);
    // BA: 7% interestadual + DIFAL 13,5% → sem o DIFAL fica só o ICMS de 7.
    assert.equal(ba.icmsDifal?.icmsInterestadual, 7);
  });

  it("não muda venda interna, nem venda para contribuinte", () => {
    const interna = venda({ ufDestino: "SP" });
    assert.equal(detalhe(interna, none).impostoTotal, detalhe(interna, base).impostoTotal);
    const b2b = venda({ tipoDocumento: "CNPJ", contribuinteIcms: true });
    assert.equal(detalhe(b2b, none).impostoTotal, detalhe(b2b, base).impostoTotal);
    assert.equal(detalhe(b2b, none).icmsDifal?.difalNaoRecolhido, undefined);
  });
});

describe("DIFAL não recolhido — todas as contas do imposto batem", () => {
  const vendas = [
    venda(),
    venda({ transactionKey: "2", orderId: "2", ufDestino: "BA", receitaBruta: 80 }),
    venda({ transactionKey: "3", orderId: "3", ufDestino: "SP" }),
    venda({ transactionKey: "4", orderId: "4", tipoDocumento: "CNPJ", contribuinteIcms: true }),
  ];

  for (const [label, config] of [
    ["all", base],
    ["none", none],
    ["some RJ", someRj],
  ] as const) {
    it(`${label}: linha, agregado, consolidado e daily_totals usam o mesmo imposto`, () => {
      const payload = calcularRelatorioFromTransacoes({
        transacoes: vendas,
        config,
        icmsRates,
        cbsIbsVigencia: null,
        year: 2026,
        month: 10,
        overrides: {},
        meta: {
          geradoEm: "2026-11-01T00:00:00.000Z",
          pedidosProcessados: vendas.length,
          linhasProcessadas: vendas.length,
          semBillingInfo: 0,
          duracaoMs: 0,
          taxRegime: "LUCRO_REAL",
          originUf: "SP",
        },
      }) as TaxReportPayload;
      const detalhes = payload.porSku.flatMap((s) => s.transacoes);
      let soma = 0;
      for (const det of detalhes) {
        assert.equal(impostoOperacionalLinha(det), det.impostoTotal);
        assert.ok(Math.abs(impostoOperacionalLinhaValor(det) - det.impostoTotal) < 0.005);
        soma += det.impostoTotal;
      }
      assert.ok(Math.abs((payload.consolidado.impostoOperacionalTotal ?? 0) - soma) < 0.02);
      const daily = buildTaxDailyTotals(payload).reduce((s, d) => s + d.i, 0);
      assert.ok(Math.abs(daily - soma) < 0.02);
      const naoRecolhido = detalhes.reduce(
        (s, d) => s + (d.icmsDifal?.difalNaoRecolhido ? d.icmsDifal.difal : 0),
        0,
      );
      assert.ok(Math.abs((payload.consolidado.difalNaoRecolhidoTotal ?? 0) - naoRecolhido) < 0.005);
      assert.equal(
        payload.consolidado.apuracao?.difalNaoRecolhidoEstimado ?? 0,
        payload.consolidado.difalNaoRecolhidoTotal ?? 0,
      );
    });
  }
});

describe("isDifalRecolhido / difalCollectionKey", () => {
  it("modos e UFs", () => {
    assert.equal(isDifalRecolhido({}, "RJ"), true);
    assert.equal(isDifalRecolhido({ difalCollection: "none" }, "RJ"), false);
    assert.equal(isDifalRecolhido({ difalCollection: "some", difalCollectedUfs: ["RJ"] }, "rj"), true);
    assert.equal(isDifalRecolhido({ difalCollection: "some", difalCollectedUfs: ["RJ"] }, "BA"), false);
    assert.equal(isDifalRecolhido({ difalCollection: "some", difalCollectedUfs: [] }, "BA"), false);
  });

  it("chave estável (ordem das UFs não importa; ausente = all)", () => {
    assert.equal(difalCollectionKey({}), "all");
    assert.equal(difalCollectionKey({ difalCollection: "none" }), "none");
    assert.equal(
      difalCollectionKey({ difalCollection: "some", difalCollectedUfs: ["RJ", "MG"] }),
      difalCollectionKey({ difalCollection: "some", difalCollectedUfs: ["MG", "RJ"] }),
    );
  });
});
