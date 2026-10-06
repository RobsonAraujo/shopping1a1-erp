import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { renderIntoDocument } from "@/test-setup/render";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { MarginSummary } from "@/lib/lucratividade/margin-summary";
import { DEFAULT_LUCRATIVIDADE_VIEW } from "@/lib/lucratividade/period-presets";
import { MarginSummaryHero } from "../MarginSummaryHero";
import { PeriodBar } from "../PeriodBar";
import { parseTargetInput } from "../TargetMarginPopover";

const noop = () => {};

// DateRangePicker usa useIsMobile (matchMedia), que o jsdom não traz.
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

function summary(overrides: Partial<MarginSummary>): MarginSummary {
  return {
    mode: "weighted",
    contributionPercent: 5.12,
    afterAdsPercent: 3.4,
    contributionValueTotal: 517,
    afterAdsValueTotal: 343,
    includedCount: 2,
    includedRevenue: 10100,
    includedUnits: 101,
    afterAdsIncludedCount: 2,
    pendingCount: 0,
    excluded: {
      count: 1,
      revenue: 200,
      units: 2,
      byReason: { missing_cost: 0, missing_tax: 1, kit_incomplete: 0, incomplete: 0 },
    },
    totalCount: 3,
    totalRevenue: 10300,
    totalUnits: 103,
    ...overrides,
  };
}

describe("PeriodBar", () => {
  it("starts on 'last 7 days' and keeps the simulation chip apart", () => {
    const { container, unmount } = renderIntoDocument(
      <PeriodBar
        view={DEFAULT_LUCRATIVIDADE_VIEW}
        range={{ from: "2026-09-30", to: "2026-10-06" }}
        customRange={{ from: "2026-09-30", to: "2026-10-06" }}
        loading={false}
        statusText={null}
        onSelectPreset={noop}
        onCommitCustom={noop}
        onSelectSimulation={noop}
        onReload={noop}
      />,
    );
    const pressed = [...container.querySelectorAll('button[aria-pressed="true"]')];
    assert.deepEqual(pressed.map((b) => b.textContent), ["7 dias"]);
    const labels = [...container.querySelectorAll("button")].map((b) => b.textContent);
    for (const label of ["Hoje", "Ontem", "Mês atual", "60 dias", "90 dias", "Personalizado"]) {
      assert.ok(labels.includes(label), `missing chip ${label}`);
    }
    assert.ok(labels.some((l) => l?.includes("Simulação · preço de hoje")));
    assert.ok(!labels.includes("15 dias") && !labels.includes("30 dias"));
    unmount();
  });
});

describe("MarginSummaryHero", () => {
  it("shows the weighted margin, its R$ total and the excluded flag", () => {
    const { container, unmount } = renderIntoDocument(
      <TooltipProvider>
        <MarginSummaryHero
          summary={summary({})}
          isSimulation={false}
          rangeLabel="Últimos 7 dias · 30/09 – 06/10"
          loading={false}
          afterAdsUnavailableText={null}
          droppedListings={null}
          excludedFilterActive={false}
          onToggleExcludedFilter={noop}
        />
      </TooltipProvider>,
    );
    const text = container.textContent ?? "";
    assert.match(text, /Margem de contribuição/);
    assert.match(text, /5,12%/);
    assert.match(text, /de margem sobre/);
    assert.match(text, /1 fora da média/);
    assert.match(text, /Média ponderada pelo faturamento/);
    unmount();
  });

  it("labels the simulation as not the real margin", () => {
    const { container, unmount } = renderIntoDocument(
      <TooltipProvider>
        <MarginSummaryHero
          summary={summary({ mode: "simple", contributionValueTotal: null })}
          isSimulation
          rangeLabel={null}
          loading={false}
          afterAdsUnavailableText={null}
          droppedListings={null}
          excludedFilterActive={false}
          onToggleExcludedFilter={noop}
        />
      </TooltipProvider>,
    );
    const text = container.textContent ?? "";
    assert.match(text, /Margem simulada no preço de hoje/);
    assert.match(text, /Não é a margem real/);
    assert.match(text, /Média simples de 2 anúncios/);
    unmount();
  });
});

describe("parseTargetInput", () => {
  it("accepts comma, dot and a trailing %", () => {
    assert.equal(parseTargetInput("6"), 6);
    assert.equal(parseTargetInput("6,5"), 6.5);
    assert.equal(parseTargetInput("6.5 %"), 6.5);
  });

  it("rejects empty and out-of-range values", () => {
    assert.equal(parseTargetInput(""), null);
    assert.equal(parseTargetInput("101"), null);
    assert.equal(parseTargetInput("abc"), null);
  });
});
