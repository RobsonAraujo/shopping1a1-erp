import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { repairTaxReportPayloadSync } from "../repair-snapshot-uf";
import type { TaxReportPayload, DetalhamentoTributario } from "../types";

function det(ufDestino: string | null, icmsDifal: unknown = null): DetalhamentoTributario {
  return {
    transacao: { ufDestino },
    incluidoNaApuracao: true,
    icmsDifal,
  } as unknown as DetalhamentoTributario;
}

function payload(overrides: Partial<TaxReportPayload> = {}): TaxReportPayload {
  return {
    consolidado: {},
    porSku: [],
    ...overrides,
  } as unknown as TaxReportPayload;
}

describe("repairTaxReportPayloadSync", () => {
  it("fixes an invalid/legacy ufDestino via resolveUfDestino in porSku transacoes", () => {
    const input = payload({
      porSku: [{ sku: "SKU-1", transacoes: [det("São Paulo")] }] as never,
    });
    const result = repairTaxReportPayloadSync(input);
    assert.equal(result.porSku[0].transacoes[0].transacao.ufDestino, "SP");
  });

  it("fixes ufDestino in root-level transacoes when present", () => {
    const input = payload({
      transacoes: [det("Rio de Janeiro")],
      porSku: [],
    });
    const result = repairTaxReportPayloadSync(input);
    assert.equal(result.transacoes?.[0].transacao.ufDestino, "RJ");
  });

  it("leaves an already-valid ufDestino unchanged in value (still backfills consolidado)", () => {
    const skuRow = { sku: "SKU-1", transacoes: [det("SP")] };
    const input = payload({ porSku: [skuRow] as never });
    const result = repairTaxReportPayloadSync(input);
    assert.equal(result.porSku[0].transacoes[0].transacao.ufDestino, "SP");
  });

  it("returns the same payload reference when nothing needed fixing and consolidado split is already present", () => {
    const input = payload({
      consolidado: { icmsSemDifalTotal: 10, difalTotal: 2 } as never,
      porSku: [{ sku: "SKU-1", transacoes: [det("SP")] }] as never,
    });
    const result = repairTaxReportPayloadSync(input);
    assert.equal(result, input);
  });

  it("backfills consolidado.icmsSemDifalTotal/difalTotal from included transactions when missing", () => {
    const input = payload({
      consolidado: {} as never,
      porSku: [
        {
          sku: "SKU-1",
          transacoes: [
            det("SP", { icmsTotal: 100, difal: 20 }),
            det("RJ", { icmsTotal: 50, difal: 10 }),
          ],
        },
      ] as never,
    });
    const result = repairTaxReportPayloadSync(input);
    assert.equal(result.consolidado.icmsSemDifalTotal, 120); // (100-20)+(50-10)
    assert.equal(result.consolidado.difalTotal, 30);
  });

  it("leaves consolidado untouched when the only transaction is excluded from the apuração", () => {
    const excluded = det("SP", { icmsTotal: 100, difal: 20 });
    (excluded as unknown as { incluidoNaApuracao: boolean }).incluidoNaApuracao = false;
    const input = payload({
      consolidado: {} as never,
      porSku: [{ sku: "SKU-1", transacoes: [excluded] }] as never,
    });
    const result = repairTaxReportPayloadSync(input);
    assert.equal(result.consolidado.icmsSemDifalTotal, undefined);
    assert.equal(result.consolidado.difalTotal, undefined);
  });

  it("does not touch consolidado when there are no included transactions at all", () => {
    const input = payload({ consolidado: {} as never, porSku: [] });
    const result = repairTaxReportPayloadSync(input);
    assert.equal(result, input);
  });
});
