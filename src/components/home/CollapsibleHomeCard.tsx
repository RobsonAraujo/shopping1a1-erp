"use client";

import { useId, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function CollapsibleHomeCard({
  icon,
  title,
  status,
  open,
  onToggle,
  children,
}: {
  icon: ReactNode;
  title: string;
  status: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const panelId = useId();

  return (
    <section className="flex w-full flex-col rounded-3xl bg-[var(--card)] p-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full cursor-pointer items-center gap-3 rounded-[20px] p-2 text-left transition-colors hover:bg-[var(--muted)] active:scale-[0.98] motion-reduce:transition-none"
      >
        {icon}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-[var(--foreground)]">
            {title}
          </span>
          <span className="mt-0.5 block truncate text-xs text-[var(--muted-foreground)]">
            {status}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-[var(--muted-foreground)] transition-transform duration-300 motion-reduce:transition-none",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      <div
        id={panelId}
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="px-2 pt-2 pb-1">{children}</div>
        </div>
      </div>
    </section>
  );
}
