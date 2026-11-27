"use client";

import { useState } from "react";
import { ChevronRight, ExternalLink, EyeOff, MoreHorizontal } from "lucide-react";
import { ListingTypeTag } from "@/components/rotina/ListingTypeTag";
import { RotinaThumb } from "@/components/rotina/RotinaThumb";
import { SegmentTag } from "@/components/rotina/SegmentTag";
import {
  RULE_ACCENT_CLASS,
  RULE_VISUALS,
  STATUS_PILL_CLASS,
  ruleIconClass,
} from "@/components/rotina/rule-visuals";
import {
  MENU_ITEM_CLASS,
  RotinaDecisionGroup,
  SEGMENT_CLASS,
  type RotinaActionHandlers,
} from "@/components/rotina/RotinaActionRow";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatMoney } from "@/lib/rotina/format";
import {
  NO_RECENT_SALES_QUICK_DAYS,
  noRecentSalesDayOptions,
} from "@/lib/rotina/no-recent-sales";
import { ROTINA_RULES } from "@/lib/rotina/rule-registry";
import { sellerListingModifyUrl } from "@/lib/mercadolibre/seller-listing-url";
import type { RotinaActionView } from "@/lib/rotina/view";
import { cn } from "@/lib/utils";

const PREVIEW_THUMBS = 4;
const PREVIEW_NAMES = 2;

function previewNames(rows: RotinaActionView[]): string {
  const names = rows.slice(0, PREVIEW_NAMES).map((row) => row.listing.title);
  const rest = rows.length - names.length;
  return rest > 0 ? `${names.join(", ")} e mais ${rest}` : names.join(", ");
}

/** "⋯" do card enxuto: só ignorar (as metas não mudam esta regra). */
function StaleMoreMenu({
  action,
  handlers,
}: {
  action: RotinaActionView;
  handlers: Pick<RotinaActionHandlers, "onDismiss" | "busy">;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          aria-label="Mais opções"
          disabled={handlers.busy}
          className={cn(SEGMENT_CLASS, "w-10 px-0 text-[var(--muted-foreground)] sm:w-9")}
        >
          <MoreHorizontal aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-1">
        <button
          type="button"
          className={MENU_ITEM_CLASS}
          onClick={() => {
            setOpen(false);
            handlers.onDismiss(action);
          }}
        >
          <EyeOff className="size-4" aria-hidden />
          <span className="min-w-0">
            Ignorar &quot;{ROTINA_RULES.no_recent_sales.settingsLabel}&quot; neste anúncio
          </span>
        </button>
      </PopoverContent>
    </Popover>
  );
}

function daysLabel(days: number): string {
  return days === 1 ? "1 dia" : `${days} dias`;
}

/**
 * Grupo "Sem venda recente": cards enxutos com o diagnóstico do retrato e
 * Feito / Adiar / Ignorar. O prazo N fica no cabeçalho em chips (persistido no
 * navegador), só até os dias de vendas lidos — mudar o dia não relê o banco.
 */
export function RotinaStaleSalesGroup({
  actions: rows,
  handlers,
  days,
  onDaysChange,
  salesWindowDays,
  configuredWindowDays,
  onOpenTargets,
  open,
  onToggle,
}: {
  actions: RotinaActionView[];
  handlers: RotinaActionHandlers;
  days: number;
  onDaysChange: (days: number) => void;
  /** Maior janela lida entre os candidatos: teto dos chips. */
  salesWindowDays: number | null;
  /** Dias pedidos em Metas (valem no próximo Atualizar). */
  configuredWindowDays: number;
  onOpenTargets: () => void;
  open: boolean;
  onToggle: () => void;
}) {
  const definition = ROTINA_RULES.no_recent_sales;
  const visual = RULE_VISUALS.no_recent_sales;
  const Icon = visual.icon;
  const sectionId = "rotina-group-no_recent_sales";
  const panelId = `${sectionId}-panel`;
  const thumbs = rows.slice(0, PREVIEW_THUMBS);
  const extraThumbs = rows.length - thumbs.length;
  const dayOptions = noRecentSalesDayOptions(salesWindowDays);
  const pendingWindow =
    salesWindowDays !== null && configuredWindowDays !== salesWindowDays;
  const canReadMore = !dayOptions.includes(NO_RECENT_SALES_QUICK_DAYS.at(-1) ?? 0);

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
            {!open ? (
              <span className="mt-0.5 block truncate text-xs font-normal text-[var(--muted-foreground)]">
                {rows.length > 0 ? previewNames(rows) : `Nenhum em ${daysLabel(days)}`}
              </span>
            ) : null}
          </span>
          {!open && rows.length > 0 ? (
            <span className="hidden shrink-0 items-center sm:flex" aria-hidden>
              {thumbs.map((row, index) => (
                <RotinaThumb
                  key={row.id}
                  src={row.listing.imageUrl}
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
              {dayOptions.map((option) => (
                <Button
                  key={option}
                  type="button"
                  size="sm"
                  variant={days === option ? "default" : "outline"}
                  aria-pressed={days === option}
                  className="h-7 px-2.5 text-xs tabular-nums"
                  onClick={() => onDaysChange(option)}
                >
                  {option}d
                </Button>
              ))}
            </div>
            {salesWindowDays !== null ? (
              <p className="text-[11px] text-[var(--muted-foreground)]">
                {pendingWindow ? (
                  <>
                    Leu {daysLabel(salesWindowDays)} de vendas · Metas pede{" "}
                    {daysLabel(configuredWindowDays)}: vale no próximo Atualizar
                  </>
                ) : (
                  <>
                    Leu {daysLabel(salesWindowDays)} de vendas ·{" "}
                    {canReadMore ? "para prazos maiores, ajuste em" : "ajuste em"}{" "}
                    <button
                      type="button"
                      onClick={onOpenTargets}
                      className="cursor-pointer font-medium text-[var(--primary)] underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
                    >
                      Metas
                    </button>
                  </>
                )}
              </p>
            ) : null}
          </div>

          {rows.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-[var(--muted-foreground)] sm:px-4">
              Nenhum anúncio ativo sem venda em {daysLabel(days)} neste segmento.
            </p>
          ) : (
            <ul className="space-y-2.5 p-2 sm:p-3">
              {rows.map((row) => {
                const listing = row.listing;
                const diagnosis = row.staleSales?.diagnosis ?? [];
                return (
                  <li
                    key={row.id}
                    className={cn(
                      "overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]",
                      RULE_ACCENT_CLASS[visual.tone],
                    )}
                  >
                    <div className="flex gap-3 px-3 py-3 sm:px-4">
                      <RotinaThumb
                        src={listing.imageUrl}
                        size={56}
                        className="size-14 shrink-0 rounded-lg"
                      />
                      <div className="min-w-0 flex-1">
                        {visual.pill || row.continues ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {visual.pill ? (
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                  STATUS_PILL_CLASS[visual.tone].wrap,
                                )}
                              >
                                <span
                                  className={cn(
                                    "size-1.5 rounded-full",
                                    STATUS_PILL_CLASS[visual.tone].dot,
                                  )}
                                  aria-hidden
                                />
                                {visual.pill}
                              </span>
                            ) : null}
                            {row.continues ? (
                              <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                                continua
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                        <p className="mt-1 truncate text-[15px] font-medium text-[var(--foreground)]">
                          {listing.title}
                        </p>
                        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs text-[var(--muted-foreground)]">
                          <SegmentTag segment={row.segment} />
                          <ListingTypeTag listingTypeId={listing.listingTypeId} />
                          {listing.saleOption ? (
                            <span className="shrink-0 text-[11px] text-[var(--muted-foreground)]">
                              produto com {listing.saleOption.optionsLabel}
                            </span>
                          ) : null}
                          {listing.sku ? (
                            <span className="truncate font-mono tabular-nums">{listing.sku}</span>
                          ) : null}
                          {listing.salePrice !== null ? (
                            <span className="tabular-nums">{formatMoney(listing.salePrice)}</span>
                          ) : null}
                        </div>
                        <p className="mt-1.5 text-[13px] text-[var(--muted-foreground)]">
                          {row.headline}
                        </p>
                        {diagnosis.length > 0 ? (
                          <ul
                            className="mt-1.5 flex flex-wrap gap-1"
                            aria-label="O que dá para mexer"
                          >
                            {diagnosis.map((note) => (
                              <li
                                key={note}
                                className="rounded-md bg-[var(--muted)]/60 px-1.5 py-0.5 text-[11px] text-[var(--muted-foreground)]"
                              >
                                {note}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 border-t border-[var(--border)] bg-[var(--muted)]/20 px-3 py-2 sm:flex-row sm:items-center sm:px-4">
                      <div className="flex flex-wrap gap-2">
                        <Button asChild size="sm" variant="outline" className="h-8">
                          <a
                            href={sellerListingModifyUrl(listing.mlItemId)}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Editar anúncio
                            <ExternalLink className="size-3.5 opacity-60" aria-hidden />
                          </a>
                        </Button>
                        <Button asChild size="sm" variant="ghost" className="h-8">
                          <a href={listing.permalink} target="_blank" rel="noopener noreferrer">
                            Ver no ML
                            <ExternalLink className="size-3.5 opacity-60" aria-hidden />
                          </a>
                        </Button>
                      </div>
                      <RotinaDecisionGroup action={row} handlers={handlers}>
                        <StaleMoreMenu action={row} handlers={handlers} />
                      </RotinaDecisionGroup>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
