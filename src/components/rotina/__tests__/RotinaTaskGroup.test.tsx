import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { renderIntoDocument } from "@/test-setup/render";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { RotinaActionHandlers } from "@/components/rotina/RotinaActionRow";
import { RotinaTaskGroup } from "@/components/rotina/RotinaTaskGroup";
import type { RotinaRuleKey } from "@/lib/rotina/rule-registry";
import { buildRotinaView } from "@/lib/rotina/view";
import { NOW, TZ, listing, settings } from "@/lib/rotina/__tests__/fixtures";

const handlers: RotinaActionHandlers = {
  busy: false,
  onDone: () => {},
  onSnooze: () => {},
  onDismiss: () => {},
  onRecalculate: () => {},
  onSaveTarget: async () => true,
};

function actionsFor(rule: RotinaRuleKey) {
  const view = buildRotinaView({
    now: NOW,
    timeZone: TZ,
    settings: settings(),
    health: [
      // Margem após ADS abaixo do mínimo e sem promoção: duas tarefas.
      listing({ mlItemId: "OWN1", marginPercent: 4, marginAfterAdsPercent: 1, hasPromotion: false, regularPrice: null }),
    ],
    catalogLive: [],
    targets: new Map(),
    states: [],
    lastRun: null,
    lastCompleteRunAt: "2026-11-10T09:00:00.000Z",
  });
  const actions = view.actions.filter((action) => action.rule === rule);
  assert.ok(actions.length > 0, `falta a tarefa ${rule}`);
  return actions;
}

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

function render(rule: RotinaRuleKey) {
  const rendered = renderIntoDocument(
    <TooltipProvider>
      <RotinaTaskGroup
        rule={rule}
        actions={actionsFor(rule)}
        handlers={handlers}
        timeZone={TZ}
        open
        onToggle={() => {}}
        lastRunLabel="hoje às 06:00"
      />
    </TooltipProvider>,
  );
  cleanup = rendered.unmount;
  return rendered.container.textContent ?? "";
}

describe("RotinaTaskGroup", () => {
  it("says the margin tasks use the 7-day TACOS, and points to Simular for today's", () => {
    assert.match(
      render("margin_below_min"),
      /Margem após ADS e TACOS dos últimos 7 dias, da atualização de hoje às 06:00\. Para testar com o TACOS de hoje, use Simular\./,
    );
  });

  it("does not show the TACOS note where the task does not depend on it", () => {
    assert.doesNotMatch(render("promo_missing"), /TACOS dos últimos 7 dias/);
  });

  describe("opções de venda", () => {
    const saleOptions = new Map([
      ["CLASSICO", { principalMlItemId: "CLASSICO", optionsLabel: "Clássico + Premium" }],
      ["PREMIUM", { principalMlItemId: "CLASSICO", optionsLabel: "Clássico + Premium" }],
    ]);
    // As duas sem promoção; a Premium também com a margem abaixo do mínimo.
    const view = buildRotinaView({
      now: NOW,
      timeZone: TZ,
      settings: settings(),
      health: [
        listing({ mlItemId: "CLASSICO", title: "Cabo Ninja 3m", hasPromotion: false, regularPrice: null, unitsPerDay: 3 }),
        listing({
          mlItemId: "PREMIUM",
          title: "Cabo Ninja 3m",
          listingTypeId: "gold_pro",
          hasPromotion: false,
          regularPrice: null,
          marginPercent: 4,
          marginAfterAdsPercent: 1,
        }),
      ],
      catalogLive: [],
      targets: new Map(),
      states: [],
      lastRun: null,
      lastCompleteRunAt: "2026-11-10T09:00:00.000Z",
      saleOptions,
    });
    const promo = view.actions.filter((action) => action.rule === "promo_missing");
    const otherTasksOf = (productKey: string, rule: RotinaRuleKey) =>
      view.actions
        .filter(
          (action) =>
            action.rule !== rule &&
            (action.listing.saleOption?.principalMlItemId ?? action.listing.mlItemId) === productKey,
        )
        .map((action) => ({
          rule: action.rule,
          mlItemId: action.listing.mlItemId,
          listingTypeId: action.listing.listingTypeId,
        }));

    function renderGroup(open: boolean, onOpenTask?: (rule: RotinaRuleKey) => void) {
      const rendered = renderIntoDocument(
        <TooltipProvider>
          <RotinaTaskGroup
            rule="promo_missing"
            actions={promo}
            handlers={handlers}
            timeZone={TZ}
            open={open}
            onToggle={() => {}}
            otherTasksOf={otherTasksOf}
            onOpenTask={onOpenTask}
          />
        </TooltipProvider>,
      );
      cleanup = rendered.unmount;
      return rendered.container;
    }

    it("shows the product once, with each option tagged and its own Feito", () => {
      const container = renderGroup(true);
      const text = container.textContent ?? "";
      assert.equal(text.split("Cabo Ninja 3m").length - 1, 1, "o título aparece uma vez");
      assert.match(text, /2 opções de venda/);
      assert.match(text, /Clássico/);
      assert.match(text, /Premium/);
      const done = [...container.querySelectorAll("button")].filter(
        (button) => button.textContent?.trim() === "Feito",
      );
      assert.equal(done.length, 2);
      // A faixa de cada opção diz o tipo: Clássico azul, Premium magenta.
      assert.ok(container.querySelector("li.border-l-sky-500"), "faixa da Clássico");
      assert.ok(container.querySelector("li.border-l-fuchsia-500"), "faixa da Premium");
      assert.equal(container.querySelector("li.border-l-rose-500"), null);
    });

    it("does not repeat the product in the closed preview", () => {
      const text = renderGroup(false).textContent ?? "";
      assert.doesNotMatch(text, /Cabo Ninja 3m, Cabo Ninja 3m/);
      assert.match(text, /Cabo Ninja 3m/);
    });

    it("points to the other option's task in another group", () => {
      const opened: RotinaRuleKey[] = [];
      const container = renderGroup(true, (rule) => opened.push(rule));
      assert.match(container.textContent ?? "", /também em:/);
      const link = [...container.querySelectorAll("button")].find((button) =>
        button.textContent?.includes("→"),
      ) as HTMLButtonElement;
      assert.ok(link);
      link.click();
      assert.deepEqual(opened, ["margin_below_min"]);
    });
  });
});
