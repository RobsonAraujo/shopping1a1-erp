import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { renderIntoDocument, waitFor } from "@/test-setup/render";
import { TooltipProvider } from "@/components/ui/tooltip";
import { computeFinancialMargin } from "@/lib/pricing/financial-margin";
import type { FinancialEvaluationRow } from "@/lib/lucratividade/financial-evaluation-data";
import type { SalesMixForItem } from "@/lib/lucratividade/sales-mix";
import { SalesMixSection } from "../detail-sheet/SalesMixSection";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

/** Alltec em 17/11 até 17:49: 39 un., preço médio 29,40, tarifa média 3,87. */
function alltecRow(): FinancialEvaluationRow {
  const breakdown = computeFinancialMargin({
    salePrice: 29.4,
    mlFeeAmount: 3.87,
    shippingCost: 7.35,
    productCost: 18.42,
    extraCosts: 0.3,
    taxRatePercent: 1.64,
    listingTypeLabel: "Clássico",
  });
  return {
    mlItemId: "MLB5713296080",
    title: "Alltec 2001 VO/GA",
    sku: "Alltec - 2001 VO/GA (Catálogo)",
    imageUrl: null,
    permalink: "https://produto.mercadolivre.com.br/MLB5713296080",
    status: "active",
    salePrice: 29.4,
    regularPrice: null,
    hasPromotion: false,
    listingTypeId: "gold_special",
    listingTypeLabel: "Clássico",
    catalogListing: true,
    productCost: 18.42,
    extraCosts: 0.3,
    taxRatePercent: 1.64,
    mlFeeAmount: 3.87,
    mlFeeRebate: null,
    mlFeeRebateOrderId: null,
    shippingCost: 7.35,
    breakdown,
    acosPercent: null,
    tacosPercent: 0,
    adsCost: 0,
    adsUnitsSold: 0,
    adsCostPerUnit: 0,
    adsPeriodDays: 1,
    marginAfterAdsPercent: breakdown.marginPercent,
    marginAfterAdsValue: breakdown.marginValue,
    hasActiveAds: false,
    adsStatus: null,
    adsMetricsAvailable: true,
    errors: [],
    warnings: [],
    notes: [],
    pmaPrice: null,
    periodUnitsSold: 39,
    periodRevenue: 1146.75,
    salesMix: [
      {
        channel: "retail",
        listingTypeId: "gold_special",
        orders: 26,
        units: 30,
        revenue: 896.1,
        saleFeeSum: 120.7,
        saleFeeKnownQty: 30,
        minUnitPrice: 29.87,
        maxUnitPrice: 29.87,
      },
      {
        channel: "b2b",
        listingTypeId: "gold_special",
        orders: 5,
        units: 9,
        revenue: 250.65,
        saleFeeSum: 30.06,
        saleFeeKnownQty: 9,
        minUnitPrice: 27.85,
        maxUnitPrice: 27.85,
      },
    ],
  };
}

const withShipments: SalesMixForItem = {
  entries: [
    {
      channel: "retail",
      listingTypeId: "gold_special",
      logistic: "full",
      orders: 24,
      units: 28,
      revenue: 836.36,
      saleFeeSum: 100.24,
      saleFeeKnownQty: 28,
      minUnitPrice: 29.87,
      maxUnitPrice: 29.87,
    },
    {
      channel: "b2b",
      listingTypeId: "gold_special",
      logistic: "full",
      orders: 5,
      units: 9,
      revenue: 250.65,
      saleFeeSum: 30.06,
      saleFeeKnownQty: 9,
      minUnitPrice: 27.85,
      maxUnitPrice: 27.85,
    },
    {
      channel: "retail",
      listingTypeId: "gold_special",
      logistic: "flex",
      orders: 2,
      units: 2,
      revenue: 59.74,
      saleFeeSum: 20.46,
      saleFeeKnownQty: 2,
      minUnitPrice: 29.87,
      maxUnitPrice: 29.87,
    },
  ],
  units: 39,
  revenue: 1146.75,
  shipments: { total: 31, classified: 31, capped: false, failed: 0 },
};

const period = {
  from: "2026-11-17",
  to: "2026-11-17",
  ordersFetchedAt: "2026-11-17T20:50:00.000Z",
};

function rowTexts(container: HTMLElement) {
  return [...container.querySelectorAll("tbody tr")].map(
    (tr) => tr.querySelector("td")?.textContent ?? "",
  );
}

describe("SalesMixSection", () => {
  it("shows channels right away and the shipping split once the panel query returns", async () => {
    const calls: string[] = [];
    const gate: { release?: () => void } = {};
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      await new Promise<void>((resolve) => {
        gate.release = resolve;
      });
      return Response.json(withShipments);
    }) as typeof fetch;

    const { container, unmount } = renderIntoDocument(
      <TooltipProvider>
        <SalesMixSection row={alltecRow()} period={period} live={{ status: "loading" }} />
      </TooltipProvider>,
    );

    // antes da busca: só varejo × B2B (já vem na linha) + aviso de carregamento
    assert.deepEqual(rowTexts(container), ["Varejo", "B2B", "Total do anúncio"]);
    assert.match(container.textContent ?? "", /Classificando a forma de envio/);
    assert.match(calls[0] ?? "", /\/api\/financial-evaluation\/sales-mix\?/);
    assert.match(calls[0] ?? "", /itemId=MLB5713296080/);
    assert.match(calls[0] ?? "", /until=2026-11-17T20%3A50%3A00.000Z/);

    await waitFor(() => assert.ok(gate.release));
    gate.release?.();
    await waitFor(() =>
      assert.deepEqual(rowTexts(container), [
        "Varejo · Full",
        "B2B · Full",
        "Varejo · Flex",
        "Total do anúncio",
      ]),
    );
    const text = container.textContent ?? "";
    assert.match(text, /10,23/); // tarifa do Flex
    assert.match(text, /Flex: a tarifa do Mercado Livre inclui custo fixo/);
    assert.doesNotMatch(text, /Classificando a forma de envio/);
    unmount();
  });

  it("keeps the channel table and explains when the shipping query fails", async () => {
    globalThis.fetch = (async () =>
      Response.json({ error: "sales_mix_failed" }, { status: 502 })) as typeof fetch;
    const { container, unmount } = renderIntoDocument(
      <TooltipProvider>
        <SalesMixSection row={alltecRow()} period={period} live={{ status: "loading" }} />
      </TooltipProvider>,
    );
    await waitFor(() =>
      assert.match(container.textContent ?? "", /Forma de envio indisponível agora/),
    );
    assert.deepEqual(rowTexts(container), ["Varejo", "B2B", "Total do anúncio"]);
    unmount();
  });
});
