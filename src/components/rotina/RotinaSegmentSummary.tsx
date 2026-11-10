"use client";

import { LayoutList, Store } from "lucide-react";
import {
  ROTINA_RULE_KEYS,
  ROTINA_RULES,
  type RotinaSegment,
} from "@/lib/rotina/rule-registry";
import type { ActionSummary, SegmentFilter } from "@/lib/rotina/view-summary";
import { RULE_COUNT_CLASS, RULE_VISUALS } from "@/components/rotina/rule-visuals";
import { cn } from "@/lib/utils";

const SEGMENT_META: Record<RotinaSegment, { label: string; icon: typeof Store }> = {
  own: { label: "Anúncios próprios", icon: Store },
  catalog: { label: "Catálogo", icon: LayoutList },
};

/**
 * Os dois chapéus do dia: próprios e catálogo. Clicar filtra a lista (clicar de
 * novo volta para "Tudo").
 */
export function RotinaSegmentSummary({
  summary,
  segment,
  onSegmentChange,
}: {
  summary: ActionSummary;
  segment: SegmentFilter;
  onSegmentChange: (segment: SegmentFilter) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {(["own", "catalog"] as const).map((key) => {
        const meta = SEGMENT_META[key];
        const Icon = meta.icon;
        const count = summary.bySegment[key];
        const byRule = summary.byRule[key];
        const selected = segment === key;
        const parts = ROTINA_RULE_KEYS.filter((rule) => (byRule[rule] ?? 0) > 0);

        return (
          <button
            key={key}
            type="button"
            onClick={() => onSegmentChange(selected ? "all" : key)}
            aria-pressed={selected}
            className={cn(
              "cursor-pointer rounded-2xl border bg-[var(--card)] px-4 py-3 text-left transition-colors",
              selected
                ? "border-[var(--primary)] ring-1 ring-[var(--primary)]/40"
                : "border-[var(--border)] hover:bg-[var(--muted)]/30",
            )}
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
              <Icon className="size-4 text-[var(--muted-foreground)]" aria-hidden />
              {meta.label}
              <span className="ml-auto text-lg font-bold tabular-nums">{count}</span>
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-[var(--muted-foreground)]">
              {parts.length > 0
                ? parts.map((rule, index) => (
                    <span key={rule}>
                      {index > 0 ? " · " : null}
                      <span className={RULE_COUNT_CLASS[RULE_VISUALS[rule].tone]}>
                        {byRule[rule]} {ROTINA_RULES[rule].shortLabel}
                      </span>
                    </span>
                  ))
                : "Nada pendente."}
            </span>
          </button>
        );
      })}
    </div>
  );
}
