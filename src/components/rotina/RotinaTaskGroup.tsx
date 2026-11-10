"use client";

import { ChevronRight } from "lucide-react";
import {
  RotinaActionRow,
  type RotinaActionHandlers,
} from "@/components/rotina/RotinaActionRow";
import { RotinaThumb } from "@/components/rotina/RotinaThumb";
import {
  RULE_COUNT_PILL_CLASS,
  RULE_ICON_CLASS,
  RULE_VISUALS,
} from "@/components/rotina/rule-visuals";
import { ROTINA_RULES, type RotinaRuleKey } from "@/lib/rotina/rule-registry";
import type { RotinaActionView } from "@/lib/rotina/view";
import { cn } from "@/lib/utils";

const PREVIEW_THUMBS = 4;
const PREVIEW_NAMES = 2;

/** "Kit Facas, Panela Inox e mais 3" — a tarefa e em quem ela cai. */
function previewNames(actions: RotinaActionView[]): string {
  const names = actions.slice(0, PREVIEW_NAMES).map((action) => action.listing.title);
  const rest = actions.length - names.length;
  return rest > 0 ? `${names.join(", ")} e mais ${rest}` : names.join(", ");
}

function rotinaGroupId(rule: RotinaRuleKey): string {
  return `rotina-group-${rule}`;
}

/**
 * Um grupo da lista do dia = uma tarefa ("Colocar promoção: X, Y, Z"). Começa
 * fechado: a pilha de grupos fechados é o resumo do que tem para hoje.
 */
export function RotinaTaskGroup({
  rule,
  actions,
  handlers,
  timeZone,
  open,
  onToggle,
}: {
  rule: RotinaRuleKey;
  actions: RotinaActionView[];
  handlers: RotinaActionHandlers;
  timeZone: string;
  open: boolean;
  onToggle: () => void;
}) {
  const definition = ROTINA_RULES[rule];
  const visual = RULE_VISUALS[rule];
  const Icon = visual.icon;
  const fresh = actions.filter((action) => action.isNew).length;
  const sectionId = rotinaGroupId(rule);
  const panelId = `${sectionId}-panel`;
  const thumbs = actions.slice(0, PREVIEW_THUMBS);
  const extraThumbs = actions.length - thumbs.length;

  return (
    <section
      id={sectionId}
      className={cn(
        "overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] transition-shadow",
        open ? "shadow-sm" : "hover:shadow-sm",
      )}
    >
      <h2>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          className="flex w-full cursor-pointer items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-[var(--muted)]/30 focus-visible:bg-[var(--muted)]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)] sm:px-4"
        >
          <ChevronRight
            className={cn(
              "size-4 shrink-0 text-[var(--muted-foreground)] transition-transform duration-200",
              open && "rotate-90",
            )}
            aria-hidden
          />
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg",
              RULE_ICON_CLASS[visual.tone],
            )}
          >
            <Icon className="size-[18px]" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-[15px] font-semibold text-[var(--foreground)]">
                {definition.taskLabel}
              </span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                  RULE_COUNT_PILL_CLASS[visual.tone],
                )}
              >
                {actions.length}
              </span>
              {fresh > 0 ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-800">
                  <span className="size-1.5 rounded-full bg-amber-500" aria-hidden />
                  {fresh} {fresh === 1 ? "novo hoje" : "novos hoje"}
                </span>
              ) : null}
            </span>
            {!open ? (
              <span className="mt-0.5 block truncate text-xs font-normal text-[var(--muted-foreground)]">
                {previewNames(actions)}
              </span>
            ) : null}
          </span>
          {!open ? (
            <span className="hidden shrink-0 items-center sm:flex" aria-hidden>
              {thumbs.map((action, index) => (
                <RotinaThumb
                  key={action.id}
                  src={action.listing.imageUrl}
                  size={32}
                  className={cn(
                    "size-8 rounded-full border-2 border-[var(--card)]",
                    index > 0 && "-ml-2.5",
                  )}
                />
              ))}
              {extraThumbs > 0 ? (
                <span className="-ml-2.5 flex size-8 items-center justify-center rounded-full border-2 border-[var(--card)] bg-[var(--muted)] text-[10px] font-semibold tabular-nums text-[var(--muted-foreground)]">
                  +{extraThumbs}
                </span>
              ) : null}
            </span>
          ) : null}
        </button>
      </h2>
      {open ? (
        <ul
          id={panelId}
          className="space-y-2.5 border-t border-[var(--border)] bg-[var(--muted)]/30 p-2 sm:p-3"
        >
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
