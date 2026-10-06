import assert from "node:assert/strict";
import { after, afterEach, before, describe, it } from "node:test";
import { act, renderIntoDocument, waitFor } from "@/test-setup/render";
import { computeFinancialMargin } from "@/lib/pricing/financial-margin";
import type { FinancialEvaluationRow } from "@/lib/lucratividade/financial-evaluation-data";
import { DEFAULT_WHOLESALE_REDUCTIONS } from "@/lib/pricing/wholesale-pricing";
import { FinancialEvaluationClient } from "../FinancialEvaluationClient";

const originalFetch = globalThis.fetch;
const originalMatchMedia = window.matchMedia;
before(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
});
after(() => {
  window.matchMedia = originalMatchMedia;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function periodRow(
  id: string,
  opts: { price: number; cost: number | null; tax: number | null; units: number },
): FinancialEvaluationRow {
  const breakdown = computeFinancialMargin({
    salePrice: opts.price,
    mlFeeAmount: opts.price * 0.12,
    shippingCost: 5,
    productCost: opts.cost,
    extraCosts: 0,
    taxRatePercent: opts.tax,
    listingTypeLabel: "Clássico",
  });
  return {
    mlItemId: id,
    title: `Produto ${id}`,
    sku: `SKU-${id}`,
    imageUrl: null,
    permalink: `https://produto.mercadolivre.com.br/${id}`,
    status: "active",
    salePrice: opts.price,
    regularPrice: null,
    hasPromotion: false,
    listingTypeId: "gold_special",
    listingTypeLabel: "Clássico",
    productCost: opts.cost,
    extraCosts: 0,
    taxRatePercent: opts.tax,
    mlFeeAmount: opts.price * 0.12,
    mlFeeRebate: null,
    mlFeeRebateOrderId: null,
    shippingCost: 5,
    breakdown,
    acosPercent: null,
    tacosPercent: 0,
    adsCost: 0,
    adsUnitsSold: 0,
    adsCostPerUnit: 0,
    adsPeriodDays: 7,
    marginAfterAdsPercent: breakdown.marginPercent,
    marginAfterAdsValue: breakdown.marginValue,
    hasActiveAds: false,
    adsStatus: null,
    adsMetricsAvailable: true,
    errors: [],
    warnings: [],
    notes: ["Preço médio do período."],
    pmaPrice: null,
    periodUnitsSold: opts.units,
    periodRevenue: opts.price * opts.units,
  };
}

const rows = [
  periodRow("MLB1", { price: 100, cost: 50, tax: 10, units: 10 }),
  periodRow("MLB2", { price: 100, cost: null, tax: 10, units: 2 }),
];

function mockFetch() {
  const encoder = new TextEncoder();
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("stream=1")) {
      return new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            const send = (e: unknown) =>
              c.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
            send({
              type: "meta",
              listingCount: rows.length,
              adsAvailable: true,
              adsUnavailableReason: null,
              droppedListings: { count: 0, units: 0, revenue: 0 },
            });
            for (const row of rows) send({ type: "row", row });
            send({ type: "complete", mode: "period" });
            c.close();
          },
        }),
        { status: 200 },
      );
    }
    if (url.includes("/min-prices")) {
      return Response.json({
        targetMarginPercent: 6,
        marginBasis: "contribution",
        patches: [],
        notOperationalIds: [],
      });
    }
    // linha ao vivo do painel
    return Response.json({ items: [rows[0]], wholesaleReductions: DEFAULT_WHOLESALE_REDUCTIONS });
  }) as typeof fetch;
  return calls;
}

describe("FinancialEvaluationClient", () => {
  it("loads the last 7 days, weights the margin and flags listings without cost", async () => {
    const calls = mockFetch();
    const { container, unmount } = renderIntoDocument(
      <FinancialEvaluationClient
        taxContext={{ taxRegime: "LUCRO_REAL", simplesRateConfigured: false }}
        initialWholesaleReductions={DEFAULT_WHOLESALE_REDUCTIONS}
      />,
    );
    await waitFor(() => {
      assert.ok(calls.some((u) => u.includes("stream=1") && u.includes("from=")));
      const text = container.textContent ?? "";
      // só MLB1 entra na média (MLB2 sem custo): 100 − 12 − 5 − 50 − 10 = 23%
      assert.match(text, /23,00%/);
      assert.match(text, /1 fora da média/);
      assert.match(text, /Sem custo/);
    });

    // abre o painel do anúncio: Atacado B2B fica desabilitado ("Em breve")
    const rowEl = [...container.querySelectorAll("tr")].find((tr) =>
      tr.textContent?.includes("SKU-MLB1"),
    );
    assert.ok(rowEl);
    act(() => {
      rowEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await waitFor(() => {
      const tab = [...document.querySelectorAll('[role="tab"]')].find((t) =>
        t.textContent?.includes("Atacado B2B"),
      ) as HTMLButtonElement | undefined;
      assert.ok(tab, "atacado tab");
      assert.equal(tab.disabled, true);
      assert.match(tab.textContent ?? "", /Em breve/);
      assert.match(document.body.textContent ?? "", /De onde vem a margem/);
    });
    unmount();
  });
});
