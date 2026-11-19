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
});
