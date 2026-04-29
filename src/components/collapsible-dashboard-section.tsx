"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type CollapsibleDashboardSectionProps = {
  title: string;
  summary: string;
  children: React.ReactNode;
};

export function CollapsibleDashboardSection({
  title,
  summary,
  children,
}: CollapsibleDashboardSectionProps) {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
      <button
        type="button"
        className="flex w-full cursor-pointer items-center justify-between gap-4 px-4 py-4 text-left transition-colors hover:bg-[var(--muted)]/30 sm:px-5"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="min-w-0">
          <span className="block text-lg font-semibold text-[var(--primary)]">
            {title}
          </span>
          <span className="mt-1 block text-sm text-[var(--muted-foreground)]">
            {summary}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "size-5 shrink-0 text-[var(--muted-foreground)] transition-transform",
            open ? "rotate-180" : "rotate-0",
          )}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="border-t border-[var(--border)] px-4 py-4 sm:px-5">
          {children}
        </div>
      ) : null}
    </section>
  );
}
