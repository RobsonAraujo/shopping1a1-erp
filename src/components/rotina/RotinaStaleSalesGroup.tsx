"use client";

import { ChevronRight, ExternalLink } from "lucide-react";
import { ListingTypeTag } from "@/components/rotina/ListingTypeTag";
import { RotinaThumb } from "@/components/rotina/RotinaThumb";
import { SegmentTag } from "@/components/rotina/SegmentTag";
import {
  RULE_ACCENT_CLASS,
  RULE_VISUALS,
  STATUS_PILL_CLASS,
  ruleIconClass,
} from "@/components/rotina/rule-visuals";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/ui/form-input";
import { formatMoney } from "@/lib/rotina/format";
import {
  NO_RECENT_SALES_QUICK_DAYS,
  daysSinceLastSale,
} from "@/lib/rotina/no-recent-sales";
import { ROTINA_RULES } from "@/lib/rotina/rule-registry";
import { sellerListingModifyUrl } from "@/lib/mercadolibre/seller-listing-url";
import type { RotinaStaleSalesCandidate } from "@/lib/rotina/view";
import { cn } from "@/lib/utils";

const PREVIEW_THUMBS = 4;
const PREVIEW_NAMES = 2;

function previewNames(rows: RotinaStaleSalesCandidate[]): string {
  const names = rows.slice(0, PREVIEW_NAMES).map((row) => row.title);
  const rest = rows.length - names.length;
  return rest > 0 ? `${names.join(", ")} e mais ${rest}` : names.join(", ");
}

function saleNote(
  row: RotinaStaleSalesCandidate,
  now: Date,
): string {
  if (row.lastSaleAt === null) {
    return `Nenhuma venda nos últimos ${row.salesWindowDays} dias`;
  }
  const days = daysSinceLastSale(row.lastSaleAt, now);
  if (days <= 0) return "Última venda hoje";
  if (days === 1) return "Última venda ontem";
  return `Última venda há ${days} dias`;
}

/**
 * Grupo "Sem venda recente": cards enxutos sem Feito/Adiar. O prazo N fica no
 * cabeçalho (persistido no navegador) — mudar o dia não relê o banco.
 */
export function RotinaStaleSalesGroup({
  rows,
  days,
  onDaysChange,
  salesWindowDays,
  now,
  open,
  onToggle,
  emptyHint,
}: {
  rows: RotinaStaleSalesCandidate[];
  days: number;
  onDaysChange: (days: number) => void;
  /** Maior janela lida entre os candidatos (aviso se o prazo pedir mais). */
  salesWindowDays: number | null;
  now: Date;
  open: boolean;
  onToggle: () => void;
  emptyHint: string | null;
}) {
  const definition = ROTINA_RULES.no_recent_sales;
  const visual = RULE_VISUALS.no_recent_sales;
  const Icon = visual.icon;
  const sectionId = "rotina-group-no_recent_sales";
  const panelId = `${sectionId}-panel`;
  const thumbs = rows.slice(0, PREVIEW_THUMBS);
  const extraThumbs = rows.length - thumbs.length;
  const windowTooSmall =
    salesWindowDays !== null && days > salesWindowDays;

  function setDays(next: number) {
    if (!Number.isFinite(next) || next < 1 || next > 90) return;
    onDaysChange(Math.round(next));
  }

  return (
    <section
      id={sectionId}
      className={cn(
        "overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] transition-shadow",
        open ? "shadow-sm" : "hover:shadow-sm",
      )}
    >
      <h3>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          className="flex w-full cursor-pointer items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-[var(--muted)]/30 focus-visible:bg-[var(--muted)]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)] sm:px-4"
        >
          <ChevronRight
            className={cn(
              "size-4 shrink-0 text-[var(--muted-foreground)] transition-transform duration-200",
              open && "rotate-90",
            )}
            aria-hidden
          />
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg",
              ruleIconClass("no_recent_sales"),
            )}
          >
            <Icon className="size-[18px]" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-[15px] font-semibold text-[var(--foreground)]">
                {definition.taskLabel}
                {visual.taskHint ? (
                  <span className="ml-1.5 text-xs font-normal text-[var(--muted-foreground)]">
                    ({visual.taskHint})
                  </span>
                ) : null}
              </span>
              <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-xs font-semibold tabular-nums text-[var(--foreground)]">
                {rows.length}
              </span>
            </span>
            {!open && rows.length > 0 ? (
              <span className="mt-0.5 block truncate text-xs font-normal text-[var(--muted-foreground)]">
                {previewNames(rows)}
              </span>
            ) : null}
          </span>
          {!open && rows.length > 0 ? (
            <span className="hidden shrink-0 items-center sm:flex" aria-hidden>
              {thumbs.map((row, index) => (
                <RotinaThumb
                  key={row.mlItemId}
                  src={row.imageUrl}
                  size={32}
                  className={cn(
                    "size-8 rounded-full border-2 border-[var(--card)]",
                    index > 0 && "-ml-2.5",
                  )}
                />
              ))}
              {extraThumbs > 0 ? (
                <span className="-ml-2.5 flex size-8 items-center justify-center rounded-full border-2 border-[var(--card)] bg-[var(--muted)] text-[10px] font-semibold tabular-nums text-[var(--muted-foreground)]">
                  +{extraThumbs}
                </span>
              ) : null}
            </span>
          ) : null}
        </button>
      </h3>

      {open ? (
        <div id={panelId} className="border-t border-[var(--border)] bg-[var(--muted)]/30">
          <div
            className="flex flex-col gap-2 border-b border-[var(--border)] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-[var(--muted-foreground)]">
                Sem venda em
              </span>
              {NO_RECENT_SALES_QUICK_DAYS.map((option) => (
                <Button
                  key={option}
                  type="button"
                  size="sm"
                  variant={days === option ? "default" : "outline"}
                  className="h-7 px-2.5 text-xs tabular-nums"
                  onClick={() => setDays(option)}
                >
                  {option}d
                </Button>
              ))}
              <label className="ml-1 flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
                <span className="sr-only">Outro prazo em dias</span>
                <FormInput
                  inputMode="numeric"
                  aria-label="Prazo em dias"
                  value={String(days)}
                  onChange={(event) => {
                    const value = Number(event.target.value.trim());
                    if (Number.isFinite(value)) setDays(value);
                  }}
                  inputClassName="h-7 w-14 px-2 text-center text-xs tabular-nums"
                />
                dias
              </label>
            </div>
            {salesWindowDays !== null ? (
              <p className="text-[11px] text-[var(--muted-foreground)]">
                Última atualização leu {salesWindowDays}{" "}
                {salesWindowDays === 1 ? "dia" : "dias"} de vendas
              </p>
            ) : null}
          </div>

          {windowTooSmall ? (
            <p className="px-3 py-3 text-sm text-amber-800 sm:px-4">
              Não dá para confirmar sem venda há {days} dias: a última atualização
              só leu {salesWindowDays} {salesWindowDays === 1 ? "dia" : "dias"}.
            </p>
          ) : null}

          {emptyHint && rows.length === 0 && !windowTooSmall ? (
            <p className="px-3 py-3 text-sm text-[var(--muted-foreground)] sm:px-4">
              {emptyHint}
            </p>
          ) : null}

          {rows.length > 0 ? (
            <ul className="space-y-2.5 p-2 sm:p-3">
              {rows.map((row) => (
                <li
                  key={row.mlItemId}
                  className={cn(
                    "overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]",
                    RULE_ACCENT_CLASS[visual.tone],
                  )}
                >
                  <div className="flex gap-3 px-3 py-3 sm:px-4">
                    <RotinaThumb src={row.imageUrl} size={56} className="size-14 shrink-0 rounded-lg" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {visual.pill ? (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                              STATUS_PILL_CLASS[visual.tone].wrap,
                            )}
                          >
                            <span
                              className={cn("size-1.5 rounded-full", STATUS_PILL_CLASS[visual.tone].dot)}
                              aria-hidden
                            />
                            {visual.pill}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-[15px] font-medium text-[var(--foreground)]">
                        {row.title}
                      </p>
                      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs text-[var(--muted-foreground)]">
                        <SegmentTag segment={row.catalogListing ? "catalog" : "own"} />
                        <ListingTypeTag listingTypeId={row.listingTypeId} />
                        {row.sku ? (
                          <span className="truncate font-mono tabular-nums">{row.sku}</span>
                        ) : null}
                        <span className="tabular-nums">{formatMoney(row.salePrice)}</span>
                      </div>
                      <p className="mt-1.5 text-[13px] text-[var(--muted-foreground)]">
                        {saleNote(row, now)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 border-t border-[var(--border)] bg-[var(--muted)]/20 px-3 py-2 sm:px-4">
                    <Button asChild size="sm" variant="outline" className="h-8">
                      <a
                        href={sellerListingModifyUrl(row.mlItemId)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Editar anúncio
                        <ExternalLink className="size-3.5 opacity-60" aria-hidden />
                      </a>
                    </Button>
                    <Button asChild size="sm" variant="ghost" className="h-8">
                      <a href={row.permalink} target="_blank" rel="noopener noreferrer">
                        Ver no ML
                        <ExternalLink className="size-3.5 opacity-60" aria-hidden />
                      </a>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
