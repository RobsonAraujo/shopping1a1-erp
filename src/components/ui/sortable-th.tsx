"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SortDirection = "asc" | "desc";

export type TableSort<K extends string> = {
  key: K;
  direction: SortDirection;
};

/**
 * Cabeçalho de coluna clicável para ordenação — padrão visual único usado em
 * todas as tabelas do site (referência original: SlowMoversTableDesktop).
 */
export function SortableTh<K extends string>({
  label,
  sortKey,
  sort,
  onSortChange,
  align = "right",
  className,
}: {
  label: React.ReactNode;
  sortKey: K;
  sort: TableSort<K>;
  onSortChange: (key: K) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = sort.key === sortKey;
  const Icon = active ? (sort.direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th className={cn("pb-2 pr-3 font-medium", align === "right" && "text-right", className)}>
      <button
        type="button"
        onClick={() => onSortChange(sortKey)}
        className={cn(
          "inline-flex cursor-pointer items-center gap-1 hover:text-[var(--foreground)]",
          align === "right" && "flex-row-reverse",
          active && "text-[var(--foreground)]",
        )}
      >
        {label}
        <Icon className="size-3" />
      </button>
    </th>
  );
}
