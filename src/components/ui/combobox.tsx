"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type ComboboxOption = {
  value: string;
  label: string;
};

/** Busca sem acento e sem caixa: nome de fornecedor em pt-BR é cheio de
 *  acento, e ninguém digita "Açúcar" com cedilha na pressa. */
function foldForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

type ComboboxProps = {
  id?: string;
  label?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  loadingMessage?: string;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  triggerClassName?: string;
  "aria-label"?: string;
};

/**
 * Select com campo de busca — mesma casca visual do `FormSelect`, para as
 * listas longas o bastante para rolar atrás de um item (fornecedores, SKUs).
 *
 * O conteúdo vai num portal acima do `Sheet` (z-130, como o tooltip): o
 * `FocusScope` do Radix pausa o trap do modal enquanto o popover está aberto,
 * então o campo de busca recebe foco normalmente dentro de um modal.
 */
export function Combobox({
  id,
  label,
  value,
  onValueChange,
  options,
  placeholder = "Selecione…",
  searchPlaceholder = "Buscar…",
  emptyMessage = "Nenhum resultado encontrado.",
  loadingMessage = "Carregando…",
  disabled,
  loading,
  className,
  triggerClassName,
  "aria-label": ariaLabel,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const listRef = React.useRef<HTMLUListElement>(null);

  const reactId = React.useId();
  const triggerId = id ?? `combobox-${reactId}`;
  const listboxId = `${triggerId}-listbox`;

  const filtered = React.useMemo(() => {
    const normalized = foldForSearch(query);
    if (!normalized) return options;
    return options.filter((option) =>
      foldForSearch(option.label).includes(normalized),
    );
  }, [options, query]);

  const selected = options.find((option) => option.value === value) ?? null;

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setQuery("");
      const index = options.findIndex((option) => option.value === value);
      setActiveIndex(index >= 0 ? index : 0);
    }
  }

  function moveActive(delta: number) {
    if (filtered.length === 0) return;
    const next = (activeIndex + delta + filtered.length) % filtered.length;
    setActiveIndex(next);
    listRef.current?.children[next]?.scrollIntoView({ block: "nearest" });
  }

  function select(option: ComboboxOption) {
    onValueChange(option.value);
    setOpen(false);
  }

  function onSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = filtered[activeIndex];
      if (option) select(option);
    }
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? (
        <label
          htmlFor={triggerId}
          className="block text-xs font-medium text-[var(--muted-foreground)]"
        >
          {label}
        </label>
      ) : null}
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            id={triggerId}
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-haspopup="listbox"
            aria-label={ariaLabel ?? label}
            disabled={disabled || loading}
            className={cn(
              "flex h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-base text-[var(--foreground)] shadow-sm transition-colors sm:h-10 sm:text-sm",
              "hover:bg-[var(--accent)]/40 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]/30 disabled:cursor-not-allowed disabled:opacity-50",
              triggerClassName,
            )}
          >
            <span
              className={cn(
                "truncate text-left",
                !selected && "text-[var(--muted-foreground)]",
              )}
            >
              {loading ? loadingMessage : (selected?.label ?? placeholder)}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-60" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={4}
          className="z-[130] w-[var(--radix-popover-trigger-width)] max-w-none p-0"
        >
          <div className="relative border-b border-[var(--border)] p-2">
            <Search
              className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-[var(--muted-foreground)]"
              aria-hidden
            />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={onSearchKeyDown}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              aria-controls={listboxId}
              aria-activedescendant={
                filtered.length > 0 ? `${listboxId}-${activeIndex}` : undefined
              }
              autoComplete="off"
              spellCheck={false}
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--background)] pr-2 pl-8 text-base text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]/30 sm:text-sm"
            />
          </div>
          <ul
            id={listboxId}
            ref={listRef}
            role="listbox"
            className="max-h-60 overflow-y-auto py-1"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-[var(--muted-foreground)]">
                {emptyMessage}
              </li>
            ) : (
              filtered.map((option, index) => {
                const isSelected = option.value === value;
                return (
                  <li
                    key={option.value}
                    id={`${listboxId}-${index}`}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => select(option)}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-[var(--foreground)]",
                      index === activeIndex && "bg-[var(--accent)]/40",
                    )}
                  >
                    <Check
                      className={cn(
                        "size-4 shrink-0",
                        isSelected ? "opacity-100" : "opacity-0",
                      )}
                      aria-hidden
                    />
                    <span className="truncate">{option.label}</span>
                  </li>
                );
              })
            )}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}
