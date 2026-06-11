"use client";

import { Search, X } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/utils";

const inputClassName =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--background)] py-2 pl-9 pr-9 text-sm text-[var(--foreground)] shadow-sm placeholder:text-[var(--muted-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

type ItemListSearchProps = {
  value: string;
  onChange: (value: string) => void;
  filteredCount?: number;
  totalCount?: number;
  placeholder?: string;
  className?: string;
};

export function ItemListSearch({
  value,
  onChange,
  filteredCount,
  totalCount,
  placeholder = "Buscar por SKU, nome ou ID MLB…",
  className,
}: ItemListSearchProps) {
  const inputId = useId();
  const isFiltering = value.trim().length > 0;
  const showCount =
    isFiltering &&
    filteredCount !== undefined &&
    totalCount !== undefined &&
    totalCount > 0;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--muted-foreground)]"
          aria-hidden
        />
        <input
          id={inputId}
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={inputClassName}
          autoComplete="off"
          spellCheck={false}
        />
        {isFiltering ? (
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
            aria-label="Limpar busca"
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>
      {showCount ? (
        <p className="text-xs text-[var(--muted-foreground)]">
          {filteredCount} de {totalCount} anúncio
          {totalCount === 1 ? "" : "s"}
        </p>
      ) : null}
    </div>
  );
}

export function itemListSearchEmptyMessage(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return "Nenhum anúncio nesta lista.";
  return `Nenhum anúncio encontrado para "${trimmed}".`;
}
