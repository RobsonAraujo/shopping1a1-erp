"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type AttentionPanelCollapseToggleProps = {
  open: boolean;
  onToggle: () => void;
  panelLabel: string;
};

export function AttentionPanelCollapseToggle({
  open,
  onToggle,
  panelLabel,
}: AttentionPanelCollapseToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
      aria-expanded={open}
      aria-label={open ? `Recolher ${panelLabel}` : `Expandir ${panelLabel}`}
    >
      <ChevronDown
        className={cn(
          "size-5 transition-transform",
          open ? "rotate-180" : "rotate-0",
        )}
        aria-hidden
      />
    </button>
  );
}
