"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  RotinaActionRow,
  type RotinaActionHandlers,
} from "@/components/rotina/RotinaActionRow";
import { RULE_ICON_CLASS, RULE_VISUALS } from "@/components/rotina/rule-visuals";
import { ROTINA_RULES, type RotinaRuleKey } from "@/lib/rotina/rule-registry";
import type { RotinaActionView } from "@/lib/rotina/view";
import { cn } from "@/lib/utils";

/** Um grupo da lista do dia = uma tarefa ("Colocar promoção: X, Y, Z"). */
export function RotinaTaskGroup({
  rule,
  actions,
  handlers,
  timeZone,
}: {
  rule: RotinaRuleKey;
  actions: RotinaActionView[];
  handlers: RotinaActionHandlers;
  timeZone: string;
}) {
  const [open, setOpen] = useState(true);
  const definition = ROTINA_RULES[rule];
  const visual = RULE_VISUALS[rule];
  const Icon = visual.icon;
  const fresh = actions.filter((action) => action.isNew).length;
  const panelId = `rotina-group-${rule}`;

  return (
    <section className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-1 py-1 text-left"
      >
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-[var(--muted-foreground)] transition-transform",
            !open && "-rotate-90",
          )}
          aria-hidden
        />
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-lg",
            RULE_ICON_CLASS[visual.tone],
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
        <h2 className="text-base font-semibold text-[var(--foreground)]">
          {definition.taskLabel}
        </h2>
        <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-xs font-semibold tabular-nums text-[var(--foreground)]">
          {actions.length}
        </span>
        {fresh > 0 ? (
          <span className="text-xs font-medium text-amber-800">
            {fresh} {fresh === 1 ? "novo hoje" : "novos hoje"}
          </span>
        ) : null}
      </button>
      {open ? (
        <ul id={panelId} className="space-y-2">
          {actions.map((action) => (
            <RotinaActionRow
              key={action.id}
              action={action}
              handlers={handlers}
              timeZone={timeZone}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
