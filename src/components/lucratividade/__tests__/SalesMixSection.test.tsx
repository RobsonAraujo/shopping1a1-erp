import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { renderIntoDocument, waitFor } from "@/test-setup/render";
import { TooltipProvider } from "@/components/ui/tooltip";
import { computeFinancialMargin } from "@/lib/pricing/financial-margin";
import type { FinancialEvaluationRow } from "@/lib/lucratividade/financial-evaluation-data";
import type { SalesMixForItem } from "@/lib/lucratividade/sales-mix";
import { SalesMixPanel, SalesMixSection } from "../detail-sheet/SalesMixSection";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

/**
 * Alltec em 17/11 até 17:49: 39 un., preço médio 29,40, tarifa média 3,87.
 * 2 un. foram Flex (sem frete), então o frete médio é 7,35 × 37/39 = 6,97.
 */
function alltecRow(): FinancialEvaluationRow {
  const breakdown = computeFinancialMargin({
    salePrice: 29.4,
    mlFeeAmount: 3.87,
    shippingCost: 6.97,
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
    shippingLogisticType: "fulfillment",
    productCost: 18.42,
    extraCosts: 0.3,
    taxRatePercent: 1.64,
    mlFeeAmount: 3.87,
    mlFeeRebate: null,
    mlFeeRebateOrderId: null,
    shippingCost: 6.97,
    shippingQuoteCost: 7.35,
    periodFlexUnits: 2,
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
        flexUnits: 2,
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
        flexUnits: 0,
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
      flexUnits: 0,
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
      flexUnits: 0,
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
      flexUnits: 2,
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

const taxContext = { taxRegime: "LUCRO_REAL" as const, simplesRateConfigured: false };

/** Rótulos das modalidades (sem o total). */
function mixLabels(container: HTMLElement) {
  return [...container.querySelectorAll("[data-mix-label]")].map((el) => el.textContent ?? "");
}

function renderSection(row = alltecRow()) {
  return renderIntoDocument(
    <TooltipProvider>
      <SalesMixSection
        row={row}
        period={period}
        live={{ status: "loading" }}
        taxContext={taxContext}
      />
    </TooltipProvider>,
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

    const { container, unmount } = renderSection();

    // antes da busca: só varejo × B2B (já vem na linha) + aviso de carregamento
    assert.deepEqual(mixLabels(container), ["Varejo", "B2B"]);
    assert.match(container.textContent ?? "", /Classificando a forma de envio/);
    assert.match(calls[0] ?? "", /\/api\/financial-evaluation\/sales-mix\?/);
    assert.match(calls[0] ?? "", /itemId=MLB5713296080/);
    assert.match(calls[0] ?? "", /until=2026-11-17T20%3A50%3A00.000Z/);

    await waitFor(() => assert.ok(gate.release));
    gate.release?.();
    await waitFor(() =>
      assert.deepEqual(mixLabels(container), ["Varejo · Full", "B2B · Full", "Varejo · Flex"]),
    );
    const text = container.textContent ?? "";
    assert.match(text, /10,23/); // tarifa do Flex
    assert.doesNotMatch(text, /Classificando a forma de envio/);

    // só o Flex tem sublinha de frete: sai sem frete (o bônus paga a entrega)
    const notes = [...container.querySelectorAll("[data-shipping-note]")].map(
      (el) => el.textContent ?? "",
    );
    assert.equal(notes.length, 1);
    assert.equal(notes[0], "sem frete: o bônus de envio paga a entrega");

    // cada modalidade tem o próprio (?)
    const triggers = [...container.querySelectorAll("button[aria-label^='Como calculamos']")].map(
      (b) => b.getAttribute("aria-label"),
    );
    assert.deepEqual(triggers, [
      "Como calculamos Varejo · Full",
      "Como calculamos B2B · Full",
      "Como calculamos Varejo · Flex",
    ]);
    unmount();
  });

  it("separates the section, shows the channel bar and what is real vs estimated", async () => {
    globalThis.fetch = (async () => Response.json(withShipments)) as typeof fetch;
    const { container, unmount } = renderSection();
    await waitFor(() => assert.equal(mixLabels(container).length, 3));

    const section = container.querySelector('section[aria-label="Composição das vendas"]');
    assert.ok(section, "painel da composição ausente");
    const bar = section.querySelector('[role="img"]');
    assert.ok(bar, "barra Varejo × B2B ausente");
    assert.match(bar.getAttribute("aria-label") ?? "", /^Faturamento do anúncio por canal — Varejo: .*; B2B: /);

    // "O que é real e o que é estimado" vem fechado — abre quem quiser
    const details = section.querySelector("details");
    assert.ok(details, "quadro real × estimado ausente");
    assert.equal(details.open, false);
    assert.match(details.querySelector("summary")?.textContent ?? "", /O que é real e o que é estimado/);

    const items = new Map(
      [...section.querySelectorAll("[data-precision-key]")].map((li) => [
        li.getAttribute("data-precision-key"),
        li.textContent ?? "",
      ]),
    );
    assert.deepEqual([...items.keys()], ["price", "fee", "shipping", "cost", "tax", "returns", "ads"]);
    assert.match(items.get("price") ?? "", /Real/);
    assert.match(items.get("fee") ?? "", /Real/);
    assert.match(
      items.get("shipping") ?? "",
      /Estimado.*frete padrão do Full do anúncio \(R\$\s7,35\/un\.\).*nas vendas que não são Flex.*Flex \(2 un\.\) entram sem frete.*Em breve/,
    );
    assert.match(items.get("cost") ?? "", /Estimado.*cadastro atual.*R\$\s18,72\/un\./i);
    assert.match(items.get("tax") ?? "", /Estimado.*Tributário.*1,64%.*Em breve/);
    assert.match(items.get("returns") ?? "", /Não descontadas.*Em breve/);
    assert.match(items.get("ads") ?? "", /Fora da tabela/);
    unmount();
  });

  it("keeps the channel table and explains when the shipping query fails", async () => {
    globalThis.fetch = (async () =>
      Response.json({ error: "sales_mix_failed" }, { status: 502 })) as typeof fetch;
    const { container, unmount } = renderSection();
    await waitFor(() =>
      assert.match(container.textContent ?? "", /Forma de envio indisponível agora/),
    );
    assert.deepEqual(mixLabels(container), ["Varejo", "B2B"]);
    unmount();
  });

  it("hides the channel bar when the listing sold through one channel only", () => {
    const row = alltecRow();
    const retailOnly = { ...row, salesMix: row.salesMix!.filter((e) => e.channel === "retail") };
    const { container, unmount } = renderIntoDocument(
      <TooltipProvider>
        <SalesMixPanel row={retailOnly} state={null} live={{ status: "loading" }} taxContext={taxContext} />
      </TooltipProvider>,
    );
    const section = container.querySelector('section[aria-label="Composição das vendas"]');
    assert.ok(section);
    assert.equal(section.querySelector('[role="img"]'), null);
    assert.deepEqual(mixLabels(container), ["Varejo"]);
    unmount();
  });
});
