"use client";

import {
  useDeferredValue,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type Ref,
} from "react";
import { ChevronRight, History, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/ui/form-input";
import { SegmentedTabs, tabId, tabPanelId } from "@/components/ui/segmented-tabs";
import { RotinaThumb } from "@/components/rotina/RotinaThumb";
import { SegmentTag } from "@/components/rotina/SegmentTag";
import {
  calculatorProductKey,
  groupCalculatorListings,
  type CalculatorListing,
  type CalculatorProductGroup,
} from "@/lib/calculadora/calculator-listings";
import { listingOptionsSummary } from "@/lib/products/listing-option-label";
import {
  buildCalculatorSearchIndex,
  searchCalculatorIndex,
} from "@/lib/rotina/calculator-search";
import { cn } from "@/lib/utils";

type SegmentFilter = "all" | "own" | "catalog";

const SEGMENT_TABS: { id: SegmentFilter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "own", label: "Próprios" },
  { id: "catalog", label: "Catálogo" },
];

/** Produtos desenhados de uma vez; o resto vem no "Mostrar mais". */
export const CALCULATOR_PAGE_SIZE = 100;

/**
 * Uma linha da lista: anúncio sozinho, produto com opções de venda (abre e
 * fecha) ou uma opção dentro do produto aberto.
 */
type PickerRow =
  | { kind: "single"; listing: CalculatorListing }
  | { kind: "product"; group: CalculatorProductGroup; expanded: boolean }
  | { kind: "option"; listing: CalculatorListing; group: CalculatorProductGroup };

/** Abre sozinho os produtos achados quando a busca acha poucos (colar um MLB ou SKU). */
const AUTO_EXPAND_MAX_GROUPS = 5;

/** O mínimo para o resumo "Clássico + Premium" (o rótulo já vem pronto da lista). */
function optionChip(listing: CalculatorListing) {
  return { mlItemId: listing.mlItemId, listingTypeId: listing.saleOption?.label ?? null };
}

/** O tipo da opção, em destaque ("Clássico", "Premium"). */
function OptionTypeBadge({ listing }: { listing: CalculatorListing }) {
  if (!listing.saleOption) return null;
  return (
    <span className="shrink-0 rounded-md bg-[var(--primary)]/10 px-2 py-0.5 text-xs font-semibold leading-tight text-[var(--primary)] ring-1 ring-inset ring-[var(--primary)]/20">
      {listing.saleOption.label}
    </span>
  );
}

function inSegment(listing: CalculatorListing, segment: SegmentFilter): boolean {
  if (segment === "all") return true;
  return segment === "catalog" ? listing.catalogListing : !listing.catalogListing;
}

/**
 * Lista de todos os anúncios da Calculadora: busca por palavras, filtro
 * Próprio/Catálogo, recentes e navegação por teclado (↑/↓ no campo, Enter
 * escolhe). É só um diretório: preço e margem saem da leitura ao vivo, ao
 * abrir o anúncio.
 *
 * Opções de venda: o produto aparece uma vez; clicar nele abre as opções
 * (Clássico, Premium…) e você escolhe qual calcular — como na Lucratividade.
 */
export function CalculatorListingPicker({
  listings,
  selectedId,
  recents,
  onSelect,
  searchInputRef,
  stickySearch = true,
}: {
  listings: CalculatorListing[];
  selectedId: string | null;
  recents: CalculatorListing[];
  /** `viaKeyboard`: veio do Enter — quem usa leva o foco ao preço. */
  onSelect: (mlItemId: string, options: { viaKeyboard: boolean }) => void;
  searchInputRef: Ref<HTMLInputElement>;
  /** Celular: a busca fica presa sob o cabeçalho do painel (não na landing). */
  stickySearch?: boolean;
}) {
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState<SegmentFilter>("all");
  const [activeIndex, setActiveIndex] = useState(0);
  const [limit, setLimit] = useState(CALCULATOR_PAGE_SIZE);
  /** Produto aberto ou fechado à mão (vence a abertura automática). */
  const [toggled, setToggled] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const listRef = useRef<HTMLUListElement>(null);
  // Digitar não espera a lista: o filtro roda numa renderização adiada.
  const deferredQuery = useDeferredValue(query);

  const index = useMemo(
    () =>
      buildCalculatorSearchIndex(listings, (listing) => ({
        mlItemId: listing.mlItemId,
        title: listing.title,
        sku: listing.sku,
      })),
    [listings],
  );

  const matches = useMemo(
    () =>
      searchCalculatorIndex(index, deferredQuery).filter((listing) =>
        inSegment(listing, segment),
      ),
    [index, deferredQuery, segment],
  );
  const groups = useMemo(
    () => groupCalculatorListings(matches, listings, (listing) => inSegment(listing, segment)),
    [matches, listings, segment],
  );
  const trimmed = query.trim();
  const selectedKey = useMemo(() => {
    const listing = selectedId ? listings.find((l) => l.mlItemId === selectedId) : undefined;
    return listing ? calculatorProductKey(listing) : null;
  }, [listings, selectedId]);

  const visibleGroups = groups.slice(0, limit);
  const autoExpand = (group: CalculatorProductGroup) =>
    group.key === selectedKey ||
    (deferredQuery.trim() !== "" && groups.length <= AUTO_EXPAND_MAX_GROUPS);
  const isExpanded = (group: CalculatorProductGroup) =>
    toggled.get(group.key) ?? autoExpand(group);
  const rows: PickerRow[] = visibleGroups.flatMap((group): PickerRow[] => {
    if (group.options.length === 1) return [{ kind: "single", listing: group.options[0] }];
    const expanded = isExpanded(group);
    return [
      { kind: "product", group, expanded },
      ...(expanded
        ? group.options.map((listing): PickerRow => ({ kind: "option", listing, group }))
        : []),
    ];
  });
  const safeActive = Math.min(activeIndex, Math.max(rows.length - 1, 0));

  /** Nova busca ou filtro: volta ao topo, à primeira página e à abertura automática. */
  function changeQuery(next: string) {
    setQuery(next);
    setActiveIndex(0);
    setLimit(CALCULATOR_PAGE_SIZE);
    setToggled(new Map());
  }

  function changeSegment(next: SegmentFilter) {
    setSegment(next);
    setActiveIndex(0);
    setLimit(CALCULATOR_PAGE_SIZE);
    setToggled(new Map());
  }

  function setExpanded(group: CalculatorProductGroup, expanded: boolean) {
    setToggled((current) => new Map(current).set(group.key, expanded));
  }

  function scrollRowIntoView(position: number) {
    listRef.current?.children[position]?.scrollIntoView?.({ block: "nearest" });
  }

  function moveActive(step: 1 | -1) {
    if (rows.length === 0) return;
    const next = (safeActive + step + rows.length) % rows.length;
    setActiveIndex(next);
    scrollRowIntoView(next);
  }

  /** Linha do produto: abre as opções e vai para a primeira; opção ou anúncio: abre a calculadora. */
  function activateRow(position: number, viaKeyboard: boolean) {
    const row = rows[position];
    if (!row) return;
    if (row.kind === "product") {
      if (!viaKeyboard) {
        setExpanded(row.group, !row.expanded);
        return;
      }
      if (!row.expanded) setExpanded(row.group, true);
      setActiveIndex(position + 1);
      return;
    }
    onSelect(row.listing.mlItemId, { viaKeyboard });
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      activateRow(safeActive, true);
    } else if (event.key === "Escape" && query) {
      event.preventDefault();
      changeQuery("");
    }
  }

  const shownRecents = recents.filter((listing) => listing.mlItemId !== selectedId).slice(0, 5);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={cn(
          "z-10 space-y-2.5 rounded-t-xl border-b border-[var(--border)] bg-[var(--card)] p-3",
          stickySearch && "sticky top-16 sm:top-20 lg:static",
        )}
      >
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]"
            aria-hidden
          />
          <FormInput
            ref={searchInputRef}
            role="combobox"
            aria-label="Buscar anúncio por título, SKU ou MLB"
            aria-expanded
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={
              rows.length > 0 ? `${listboxId}-${safeActive}` : undefined
            }
            placeholder="Buscar por título, SKU ou MLB"
            value={query}
            onChange={(event) => changeQuery(event.target.value)}
            onKeyDown={onSearchKeyDown}
            autoComplete="off"
            spellCheck={false}
            inputClassName="pl-9 pr-10"
          />
          {query ? (
            <button
              type="button"
              onClick={() => changeQuery("")}
              aria-label="Limpar busca"
              className="absolute right-2 top-1/2 inline-flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : (
            <kbd
              className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-[var(--border)] bg-[var(--muted)]/50 px-1.5 text-[11px] font-medium text-[var(--muted-foreground)] lg:inline"
              aria-hidden
            >
              /
            </kbd>
          )}
        </div>

        <SegmentedTabs<SegmentFilter>
          baseId={baseId}
          ariaLabel="Tipo de anúncio"
          value={segment}
          onValueChange={changeSegment}
          tabs={SEGMENT_TABS}
          className="w-full"
        />

        {shownRecents.length > 0 && !trimmed ? (
          <div className="flex min-w-0 items-center gap-1.5">
            <History className="size-3.5 shrink-0 text-[var(--muted-foreground)]" aria-label="Recentes" />
            <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-0.5">
              {shownRecents.map((listing) => (
                <button
                  key={listing.mlItemId}
                  type="button"
                  onClick={() => onSelect(listing.mlItemId, { viaKeyboard: false })}
                  title={
                    listing.saleOption ? `${listing.title} · ${listing.saleOption.label}` : listing.title
                  }
                  className="max-w-[11rem] shrink-0 cursor-pointer truncate rounded-full border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-xs text-[var(--foreground)] transition-colors hover:border-[var(--primary)]/40 hover:bg-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  {listing.title}
                  {listing.saleOption ? (
                    <span className="font-semibold text-[var(--primary)]"> · {listing.saleOption.label}</span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <p className="text-xs tabular-nums text-[var(--muted-foreground)]" aria-live="polite">
          {groups.length === 1 ? "1 produto" : `${groups.length} produtos`}
          {matches.length !== groups.length ? ` (${matches.length} anúncios)` : ""}
          {trimmed ? ` para “${trimmed}”` : ""}
        </p>
      </div>

      <div
        id={tabPanelId(baseId, segment)}
        role="tabpanel"
        aria-labelledby={tabId(baseId, segment)}
        className="min-h-0 flex-1 lg:overflow-y-auto"
      >
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-[var(--muted-foreground)]">
            Nenhum anúncio {trimmed ? `para “${trimmed}”` : "neste filtro"}.
            <span className="mt-1 block text-xs">
              Busque por palavras do título, pelo SKU ou pelo MLB.
            </span>
          </p>
        ) : (
          <ul
            id={listboxId}
            ref={listRef}
            role="listbox"
            aria-label="Anúncios"
            className="divide-y divide-[var(--border)]"
          >
            {rows.map((row, position) => {
              const active = position === safeActive;
              const rowId = `${listboxId}-${position}`;
              if (row.kind === "product") {
                const { group, expanded } = row;
                const lead = group.lead;
                const holdsSelected = !expanded && group.key === selectedKey;
                const allPaused = group.options.every(
                  (option) => option.mlStatus && option.mlStatus !== "active",
                );
                return (
                  <li
                    key={`product:${group.key}`}
                    id={rowId}
                    role="option"
                    aria-selected={false}
                    data-expanded={expanded}
                    onMouseEnter={() => setActiveIndex(position)}
                    onClick={() => activateRow(position, false)}
                    className={cn(
                      "relative flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors",
                      active && "bg-[var(--accent)]/50",
                      holdsSelected && "bg-[var(--primary)]/[0.07]",
                    )}
                  >
                    {holdsSelected ? (
                      <span
                        className="absolute inset-y-0 left-0 w-0.5 bg-[var(--primary)]"
                        aria-hidden
                      />
                    ) : null}
                    <RotinaThumb src={lead.imageUrl} size={40} className="size-10" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--foreground)]">
                        {lead.title}
                      </p>
                      <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
                        <ChevronRight
                          className={cn(
                            "size-3.5 shrink-0 transition-transform",
                            expanded && "rotate-90",
                          )}
                          aria-hidden
                        />
                        <span className="shrink-0 font-medium text-[var(--foreground)]">
                          {group.options.length} opções
                        </span>
                        <span className="truncate">
                          · {listingOptionsSummary(group.options.map(optionChip))}
                        </span>
                        <span className="sr-only">
                          {expanded ? ", opções abertas" : ", escolha para ver as opções"}
                        </span>
                      </p>
                    </div>
                    {allPaused ? (
                      <span className="shrink-0 text-[11px] text-[var(--muted-foreground)]">
                        pausado
                      </span>
                    ) : null}
                  </li>
                );
              }

              const listing = row.listing;
              const selected = listing.mlItemId === selectedId;
              const nested = row.kind === "option";
              return (
                <li
                  key={listing.mlItemId}
                  id={rowId}
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setActiveIndex(position)}
                  onClick={() => activateRow(position, false)}
                  className={cn(
                    "relative flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors",
                    nested && "border-l-2 border-l-[var(--border)] bg-[var(--muted)]/20 py-2 pl-12",
                    active && "bg-[var(--accent)]/50",
                    selected && "bg-[var(--primary)]/[0.07]",
                  )}
                >
                  {selected ? (
                    <span
                      className="absolute inset-y-0 left-0 w-0.5 bg-[var(--primary)]"
                      aria-hidden
                    />
                  ) : null}
                  {nested ? null : (
                    <RotinaThumb src={listing.imageUrl} size={40} className="size-10" />
                  )}
                  <div className="min-w-0 flex-1">
                    {nested ? (
                      <p className="flex min-w-0 items-center gap-2 text-sm">
                        <OptionTypeBadge listing={listing} />
                        <span
                          className={cn(
                            "truncate font-mono text-xs text-[var(--foreground)]",
                            selected && "font-semibold",
                          )}
                        >
                          {listing.mlItemId}
                        </span>
                      </p>
                    ) : (
                      <p
                        className={cn(
                          "truncate text-sm text-[var(--foreground)]",
                          selected ? "font-semibold" : "font-medium",
                        )}
                      >
                        {listing.title}
                      </p>
                    )}
                    <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
                      <SegmentTag segment={listing.catalogListing ? "catalog" : "own"} />
                      {nested ? null : <OptionTypeBadge listing={listing} />}
                      <span className="truncate">
                        {nested ? (listing.sku ?? "") : (listing.sku ?? listing.mlItemId)}
                      </span>
                    </p>
                  </div>
                  {listing.mlStatus && listing.mlStatus !== "active" ? (
                    <span className="shrink-0 text-[11px] text-[var(--muted-foreground)]">
                      pausado
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {groups.length > visibleGroups.length ? (
          <div className="border-t border-[var(--border)] p-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => setLimit((current) => current + CALCULATOR_PAGE_SIZE)}
            >
              Mostrar mais ({groups.length - visibleGroups.length} restantes)
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
