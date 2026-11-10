import {
  ROTINA_RULE_KEYS,
  type RotinaRuleKey,
  type RotinaSegment,
} from "@/lib/rotina/rule-registry";
import type { RotinaActionView } from "@/lib/rotina/view";
import type { ActionBucket } from "@/lib/rotina/visibility";

/**
 * Contas da tela a partir da lista de ações — client-safe (só tipos de
 * `view.ts`). Roda depois das decisões otimistas: marcar "feito" move o
 * contador na hora, sem esperar o servidor.
 */

export type ActionOverride = {
  bucket: ActionBucket;
  doneToday: boolean;
  snoozedUntil?: string | null;
};

export type SegmentFilter = "all" | RotinaSegment;

export function applyActionOverrides(
  actions: readonly RotinaActionView[],
  overrides: ReadonlyMap<string, ActionOverride>,
): RotinaActionView[] {
  if (overrides.size === 0) return actions.slice();
  return actions.map((action) => {
    const override = overrides.get(action.id);
    if (!override) return action;
    return {
      ...action,
      bucket: override.bucket,
      doneToday: override.doneToday,
      continues: override.bucket === "active" ? action.continues : false,
      snoozedUntil:
        override.snoozedUntil !== undefined ? override.snoozedUntil : action.snoozedUntil,
      // A hora certa chega com o recarregamento; até lá, sem hora.
      decidedAt: null,
    };
  });
}

export function inSegment(action: RotinaActionView, segment: SegmentFilter): boolean {
  return segment === "all" || action.segment === segment;
}

export type ActionSummary = {
  active: number;
  newToday: number;
  doneToday: number;
  bySegment: Record<RotinaSegment, number>;
  byRule: Record<RotinaSegment, Partial<Record<RotinaRuleKey, number>>>;
};

export function summarizeActions(actions: readonly RotinaActionView[]): ActionSummary {
  const summary: ActionSummary = {
    active: 0,
    newToday: 0,
    doneToday: 0,
    bySegment: { own: 0, catalog: 0 },
    byRule: { own: {}, catalog: {} },
  };
  for (const action of actions) {
    if (action.doneToday) summary.doneToday += 1;
    if (action.bucket !== "active") continue;
    summary.active += 1;
    if (action.isNew) summary.newToday += 1;
    summary.bySegment[action.segment] += 1;
    const bucket = summary.byRule[action.segment];
    bucket[action.rule] = (bucket[action.rule] ?? 0) + 1;
  }
  return summary;
}

export type ActionGroup = { rule: RotinaRuleKey; actions: RotinaActionView[] };

/** Ações ativas agrupadas por tarefa, na ordem do registro. */
export function groupActiveByRule(
  actions: readonly RotinaActionView[],
  segment: SegmentFilter,
): ActionGroup[] {
  const byRule = new Map<RotinaRuleKey, RotinaActionView[]>();
  for (const action of actions) {
    if (action.bucket !== "active" || !inSegment(action, segment)) continue;
    const list = byRule.get(action.rule) ?? [];
    list.push(action);
    byRule.set(action.rule, list);
  }
  return ROTINA_RULE_KEYS.filter((rule) => byRule.has(rule)).map((rule) => ({
    rule,
    actions: byRule.get(rule)!,
  }));
}
