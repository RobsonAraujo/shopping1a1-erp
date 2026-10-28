import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderIntoDocument } from "@/test-setup/render";
import { DreTaxAuditModal } from "@/components/dre/DreTaxAuditModal";
import type { DreTaxSource } from "@/lib/dre/dre-calculations";

function source(overrides: Partial<DreTaxSource> = {}): DreTaxSource {
  return {
    regime: "LUCRO_REAL",
    report: {
      generatedAt: "2026-10-02T10:00:00.000Z",
      ordersFetchedAt: "2026-10-02T10:00:00.000Z",
      revenue: 10_000,
      tax: 900,
      orderCount: 100,
      legacy: false,
    },
    simplesRatePercent: null,
    paidOrderCount: 100,
    baseRevenue: 9_000,
    computedTax: 810,
    returnedPaidRevenue: 1_000,
    returnedPaidTax: 90,
    fallbackItemCount: 0,
    missingItemCount: 0,
    missingRevenue: 0,
    computedAt: "2026-10-02T11:00:00.000Z",
    previousTaxErp: null,
    origin: "sync",
    ...overrides,
  };
}

function render(taxSource: DreTaxSource) {
  return renderIntoDocument(
    <DreTaxAuditModal
      open
      title="set."
      items={[
        {
          key: "item:MLB1",
          sku: "SKU-1",
          title: "Produto",
          quantity: 9,
          revenue: 9_000,
          taxPercent: 9,
          totalTax: 810,
          missingTax: false,
          returnedQuantity: 1,
          returnedRevenue: 1_000,
          returnedTax: 90,
          rateSource: { kind: "report", year: 2026, month: 8 },
        },
      ]}
      taxSource={taxSource}
      onClose={() => {}}
    />,
  );
}

describe("DreTaxAuditModal — conferência com o tributário", () => {
  it("shows report tax − returned paid orders = DRE tax, and says it matches", () => {
    const view = render(source());
    const text = document.body.textContent ?? "";
    assert.match(text, /Conferência com o tributário \(versão de 02\/10\)/);
    assert.match(text, /Devolvidas pagas/);
    assert.match(text, /Bate com o tributário\./);
    // Origem do % de um anúncio que usou o relatório de outro mês.
    assert.match(text, /de ago\/26/);
    view.unmount();
  });

  it("lists why it does not match when the DRE used other rates", () => {
    const view = render(
      source({ computedTax: 700, fallbackItemCount: 2, paidOrderCount: 97 }),
    );
    const text = document.body.textContent ?? "";
    assert.match(text, /2 anúncio\(s\) com % de outro mês/);
    assert.match(text, /pedidos pagos: 97 no DRE × 100 no tributário/);
    assert.doesNotMatch(text, /Bate com o tributário\./);
    view.unmount();
  });

  it("warns when the month had no tax report", () => {
    const view = render(source({ report: null }));
    assert.match(document.body.textContent ?? "", /não tinha relatório tributário/);
    view.unmount();
  });
});
