"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type BadgeVariant = "destructive" | "warning" | "secondary" | "success";

type InsightExpandableCardProps = {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  iconClassName: string;
  accentClassName: string;
  badge?: string;
  badgeVariant?: BadgeVariant;
  defaultOpen?: boolean;
  children: React.ReactNode;
};

export function InsightExpandableCard({
  title,
  subtitle,
  icon,
  iconClassName,
  accentClassName,
  badge,
  badgeVariant = "secondary",
  defaultOpen = false,
  children,
}: InsightExpandableCardProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm",
        "border-l-4",
        accentClassName,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-[var(--muted)]/30 sm:px-5"
      >
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            iconClassName,
          )}
        >
          {icon}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold text-[var(--primary)]">
              {title}
            </span>
            {badge && (
              <Badge variant={badgeVariant} className="px-1.5 py-0 text-[10px]">
                {badge}
              </Badge>
            )}
          </span>
          <span className="mt-0.5 block text-xs text-[var(--muted-foreground)]">
            {subtitle}
          </span>
        </span>

        <ChevronDown
          className={cn(
            "size-5 shrink-0 text-[var(--muted-foreground)] transition-transform duration-200",
            open ? "rotate-180" : "rotate-0",
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div className="border-t border-[var(--border)] px-4 py-4 sm:px-5">
          {children}
        </div>
      )}
    </div>
  );
}
