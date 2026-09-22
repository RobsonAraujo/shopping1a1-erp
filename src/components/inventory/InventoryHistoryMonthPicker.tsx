"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { MONTH_NAMES_PT } from "@/lib/inventory/inventory-stock-report";
import type { InventoryMonthSnapshotSource } from "@/generated/prisma/client";
import { cn } from "@/lib/utils";

export type InventoryHistoryMonthOption = {
  year: number;
  month: number;
  source?: InventoryMonthSnapshotSource;
};

function monthValue(option: InventoryHistoryMonthOption): string {
  return `${option.year}-${option.month}`;
}

function groupMonthsByYear(months: InventoryHistoryMonthOption[]) {
  const groups: { year: number; months: InventoryHistoryMonthOption[] }[] = [];
  for (const option of months) {
    const last = groups[groups.length - 1];
    if (last?.year === option.year) last.months.push(option);
    else groups.push({ year: option.year, months: [option] });
  }
  return groups;
}

export function InventoryHistoryMonthPicker({
  months,
  selected,
}: {
  months: InventoryHistoryMonthOption[];
  selected: InventoryHistoryMonthOption;
}) {
  const selectedRef = useRef<HTMLAnchorElement | null>(null);
  const selectedValue = monthValue(selected);
  const groups = useMemo(() => groupMonthsByYear(months), [months]);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [selectedValue]);

  return (
    <nav aria-label="Meses fechados" className="space-y-3">
      {groups.map((group) => (
        <div key={group.year} className="space-y-2">
          <p className="text-[11px] font-semibold tracking-wide text-[var(--muted-foreground)] uppercase">
            {group.year}
          </p>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
            {group.months.map((option) => {
              const value = monthValue(option);
              const isSelected = value === selectedValue;
              const href = `/dashboard/inventory/historico?year=${option.year}&month=${option.month}`;
              const shortName = MONTH_NAMES_PT[option.month - 1]?.slice(0, 3);

              return (
                <Link
                  key={value}
                  href={href}
                  ref={isSelected ? selectedRef : undefined}
                  aria-current={isSelected ? "page" : undefined}
                  className={cn(
                    "flex min-w-[4.75rem] shrink-0 flex-col items-center rounded-xl border px-3 py-2 text-center transition-colors",
                    isSelected
                      ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--foreground)] shadow-sm"
                      : "border-[var(--border)] bg-[var(--background)] text-[var(--muted-foreground)] hover:border-[var(--primary)]/40 hover:text-[var(--foreground)]",
                  )}
                >
                  <span className="text-sm font-semibold tracking-tight">
                    {shortName}
                  </span>
                  {option.source === "manual" ? (
                    <span
                      className={cn(
                        "mt-0.5 text-[10px] font-medium",
                        isSelected
                          ? "text-amber-800"
                          : "text-[var(--muted-foreground)]",
                      )}
                    >
                      manual
                    </span>
                  ) : (
                    <span className="mt-0.5 text-[10px] opacity-70">oficial</span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
