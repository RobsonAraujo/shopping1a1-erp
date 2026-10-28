import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { agregarPorSku } from "@/lib/tax-report/aggregation/agregador-por-sku";
import { buildTaxDailyTotals } from "@/lib/tax-report/aggregation/daily-totals";
import type { DetalhamentoTributario, TaxReportPayload } from "@/lib/tax-report/types";

function detalhe(
  itemId: string,
  orderDate: string,
  receita: number,
  overrides: Partial<DetalhamentoTributario> = {},
): DetalhamentoTributario {
  return {
    transacao: {
      transactionKey: `${itemId}-${orderDate}-${receita}`,
      orderId: "1",
      orderDate,
      sku: `SKU-${itemId}`,
      itemId,
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
    pisCofins: { liquido: 1.505 } as DetalhamentoTributario["pisCofins"],
    icmsDifal: { icmsTotal: 5.333 } as DetalhamentoTributario["icmsDifal"],
    icmsCreditoCompra: { creditoTotal: 1.1 } as DetalhamentoTributario["icmsCreditoCompra"],
    creditoOutrasDespesas: { creditoTotal: 0.37 } as DetalhamentoTributario["creditoOutrasDespesas"],
    cbsIbs: null,
    impostoTotal: 6.5,
    margemOperacionalEstimada: 0,
    incluidoNaApuracao: true,
    memoriaCalculo: [],
    ...overrides,
  };
}

function payloadOf(detalhes: DetalhamentoTributario[]): TaxReportPayload {
  return { porSku: agregarPorSku(detalhes) } as unknown as TaxReportPayload;
}

describe("buildTaxDailyTotals", () => {
  it("buckets a sale by the business-timezone day (23:15 −04:00 on the 31st is the 1st in São Paulo)", () => {
    const totals = buildTaxDailyTotals(
      payloadOf([detalhe("MLB1", "2026-08-31T23:15:26.000-04:00", 100)]),
    );
    assert.equal(totals.length, 1);
    assert.equal(totals[0].d, "2026-09-01");
    assert.equal(totals[0].k, "MLB1");
    assert.equal(totals[0].s, "SKU-MLB1");
  });

  it("sums sales of the same listing on the same day and splits different days", () => {
    const totals = buildTaxDailyTotals(
      payloadOf([
        detalhe("MLB1", "2026-09-02T10:00:00.000-03:00", 100),
        detalhe("MLB1", "2026-09-02T18:00:00.000-03:00", 50),
        detalhe("MLB1", "2026-09-03T09:00:00.000-03:00", 30),
        detalhe("MLB2", "2026-09-02T11:00:00.000-03:00", 70),
      ]),
    );
    const day2 = totals.find((t) => t.d === "2026-09-02" && t.k === "MLB1");
    assert.equal(day2?.r, 150);
    assert.equal(day2?.n, 2);
    assert.equal(totals.length, 3);
  });

  it("skips sales left out of the apuração", () => {
    const totals = buildTaxDailyTotals({
      porSku: [
        {
          transacoes: [
            detalhe("MLB1", "2026-09-02T10:00:00.000-03:00", 100),
            detalhe("MLB1", "2026-09-02T11:00:00.000-03:00", 999, {
              incluidoNaApuracao: false,
            }),
          ],
        },
      ],
    } as unknown as TaxReportPayload);
    assert.equal(totals.length, 1);
    assert.equal(totals[0].r, 100);
  });

  it("days of a listing add up to its monthly receitaTotal/impostoOperacionalTotal", () => {
    const detalhes = [
      detalhe("MLB1", "2026-09-01T10:00:00.000-03:00", 100.11),
      detalhe("MLB1", "2026-09-01T12:00:00.000-03:00", 33.33),
      detalhe("MLB1", "2026-09-15T12:00:00.000-03:00", 77.77),
      detalhe("MLB1", "2026-09-30T23:59:00.000-03:00", 12.34),
      detalhe("MLB2", "2026-09-10T12:00:00.000-03:00", 250),
    ];
    const payload = payloadOf(detalhes);
    const totals = buildTaxDailyTotals(payload);

    for (const row of payload.porSku) {
      const days = totals.filter((t) => t.k === row.mlItemId);
      const receita = days.reduce((sum, t) => sum + t.r, 0);
      const imposto = days.reduce((sum, t) => sum + t.i, 0);
      assert.ok(Math.abs(receita - row.receitaTotal) < 0.01);
      assert.ok(Math.abs(imposto - (row.impostoOperacionalTotal ?? 0)) < 0.05);
    }
  });
});
