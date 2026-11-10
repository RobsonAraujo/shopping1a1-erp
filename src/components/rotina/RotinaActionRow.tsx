"use client";

import { useState } from "react";
import {
  Calculator,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  EyeOff,
  MoreHorizontal,
  RefreshCw,
  Target,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RotinaFloorBox } from "@/components/rotina/RotinaFloorBox";
import {
  RotinaListingTargetForm,
  type ListingTargetDraft,
} from "@/components/rotina/RotinaListingTargetForm";
import {
  RotinaPriceSimulator,
  buildSimulatorSuggestions,
} from "@/components/rotina/RotinaPriceSimulator";
import { RotinaThumb } from "@/components/rotina/RotinaThumb";
import { SegmentTag } from "@/components/rotina/SegmentTag";
import {
  RULE_ACCENT_CLASS,
  RULE_VISUALS,
  STATUS_PILL_CLASS,
} from "@/components/rotina/rule-visuals";
import { formatMoney, formatUnitsPerDay } from "@/lib/rotina/format";
import { ROTINA_RULES } from "@/lib/rotina/rule-registry";
import type { RotinaActionView } from "@/lib/rotina/view";
import { cn } from "@/lib/utils";

export type RotinaActionHandlers = {
  onDone: (action: RotinaActionView) => void;
  onSnooze: (action: RotinaActionView, days: number) => void;
  onDismiss: (action: RotinaActionView) => void;
  onRecalculate: (mlItemId: string) => void;
  onSaveTarget: (
    action: RotinaActionView,
    draft: ListingTargetDraft,
  ) => Promise<boolean>;
  busy: boolean;
};

const SHOW_DISCOUNT = new Set(["promo_expiring", "promo_missing"]);

export const SNOOZE_OPTIONS = [
  { days: 1, label: "Até amanhã" },
  { days: 3, label: "Por 3 dias" },
  { days: 7, label: "Por 7 dias" },
] as const;

const MENU_ITEM_CLASS =
  "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[var(--foreground)] hover:bg-[var(--muted)] focus-visible:bg-[var(--muted)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";

const VERDICT_CLASS = {
  ok: "border-emerald-200/80 bg-emerald-50 text-emerald-900",
  bad: "border-rose-200/80 bg-rose-50 text-rose-900",
  neutral: "border-[var(--border)] bg-[var(--muted)]/40 text-[var(--muted-foreground)]",
} as const;

/** Preço que o simulador já abre testando, e os atalhos ao lado do campo. */
function simulatorSetup(action: RotinaActionView) {
  const catalog = action.catalog;
  const contested = catalog?.status === "losing" || catalog?.status === "shared";
  const promo = action.rule === "promo_missing" || action.rule === "promo_expiring";
  const suggestions = buildSimulatorSuggestions({
    priceToWin: contested ? (catalog?.priceToWin ?? null) : null,
    suggestedPrice: contested ? (catalog?.suggestedPrice ?? null) : null,
    floor: action.floor,
    salePrice: action.listing.salePrice,
    discounts: promo ? [5, 10, 15, 20] : undefined,
  });
  const defaultPrice = contested
    ? (catalog?.suggestedPrice ?? catalog?.priceToWin ?? action.listing.salePrice)
    : (action.floor?.effectivePrice ?? action.listing.salePrice);
  return { suggestions, defaultPrice: defaultPrice ?? null, contested };
}

export function RotinaActionRow({
  action,
  handlers,
  timeZone,
}: {
  action: RotinaActionView;
  handlers: RotinaActionHandlers;
  timeZone: string;
}) {
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState(false);
  const [savingTarget, setSavingTarget] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const { listing } = action;
  const definition = ROTINA_RULES[action.rule];
  const visual = RULE_VISUALS[action.rule];
  const simulator = action.kind === "condition" ? simulatorSetup(action) : null;
  const VerdictIcon =
    action.verdict?.tone === "ok" ? CheckCircle2 : action.verdict?.tone === "bad" ? XCircle : null;
  const statusPill = visual.pill && visual.tone !== "neutral" ? visual.tone : null;
  const hasPills = statusPill !== null || action.isNew || action.continues;
  const meta = [
    listing.sku,
    listing.mlItemId,
    listing.unitsPerDay !== null ? formatUnitsPerDay(listing.unitsPerDay) : null,
    !action.isNew ? action.ageLabel : null,
  ].filter(Boolean);

  return (
    <li
      className={cn(
        "overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-[0_1px_2px_rgba(15,18,31,0.04)]",
        RULE_ACCENT_CLASS[visual.tone],
      )}
    >
      <div className="flex gap-3 p-3 sm:gap-4 sm:p-4">
        <a
          href={listing.permalink}
          target="_blank"
          rel="noopener noreferrer"
          tabIndex={-1}
          aria-hidden
          className="shrink-0"
        >
          <RotinaThumb src={listing.imageUrl} size={56} className="size-12 sm:size-14" />
        </a>

        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-2">
            <a
              href={listing.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 truncate rounded text-sm font-semibold text-[var(--foreground)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:flex-1"
              title={listing.title}
            >
              {listing.title}
            </a>
            {hasPills ? (
              <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0 sm:justify-end">
                {statusPill ? (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      STATUS_PILL_CLASS[statusPill].wrap,
                    )}
                  >
                    <span
                      className={cn("size-1.5 rounded-full", STATUS_PILL_CLASS[statusPill].dot)}
                      aria-hidden
                    />
                    {visual.pill}
                  </span>
                ) : null}
                {action.isNew ? (
                  <Badge variant="warning" className="px-1.5 py-0 text-[10px] uppercase">
                    Novo
                  </Badge>
                ) : null}
                {action.continues ? (
                  <Badge variant="muted" className="px-1.5 py-0 text-[10px]">
                    Continua
                  </Badge>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-[var(--muted-foreground)]">
            <SegmentTag segment={action.segment} />
            <span className="min-w-0 truncate tabular-nums">{meta.join(" · ")}</span>
          </div>

          <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-5">
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-medium leading-snug text-[var(--foreground)]">
                {action.headline}
              </p>
              {action.details.length > 0 ? (
                <ul className="mt-1 space-y-0.5 text-[13px] leading-relaxed text-[var(--muted-foreground)]">
                  {action.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              ) : null}

              {action.related ? (
                <p className="mt-1.5 text-[13px] text-[var(--muted-foreground)]">
                  Catálogo:{" "}
                  <a
                    href={action.related.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-[var(--primary)] underline-offset-4 hover:underline"
                  >
                    {action.related.title}
                  </a>
                </p>
              ) : null}

              {action.verdict ? (
                <p
                  className={cn(
                    "mt-2.5 inline-flex max-w-full items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium",
                    VERDICT_CLASS[action.verdict.tone],
                  )}
                >
                  {VerdictIcon ? (
                    <VerdictIcon className="mt-px size-3.5 shrink-0" aria-hidden />
                  ) : null}
                  {action.verdict.text}
                </p>
              ) : null}
            </div>

            {action.floor ? (
              <RotinaFloorBox
                floor={action.floor}
                showDiscount={SHOW_DISCOUNT.has(action.rule)}
                onRecalculate={
                  listing.hasHealth ? () => handlers.onRecalculate(listing.mlItemId) : undefined
                }
                recalculateDisabled={handlers.busy}
                className="lg:w-72 lg:shrink-0"
              />
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] bg-[var(--muted)]/20 px-3 py-2 sm:px-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {simulator ? (
            <Button
              size="sm"
              variant={simulating ? "secondary" : "outline"}
              onClick={() => setSimulating((open) => !open)}
              aria-expanded={simulating}
            >
              <Calculator aria-hidden />
              {simulator.contested && simulator.defaultPrice !== null
                ? `Simular a ${formatMoney(simulator.defaultPrice)}`
                : "Simular preço"}
            </Button>
          ) : null}
          <Button asChild variant="ghost" size="sm">
            <a
              href={action.related?.permalink ?? listing.permalink}
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir no ML
              <ExternalLink aria-hidden />
            </a>
          </Button>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <Popover open={snoozeOpen} onOpenChange={setSnoozeOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" variant="ghost" disabled={handlers.busy}>
                <Clock aria-hidden />
                Adiar
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-44 p-1">
              {SNOOZE_OPTIONS.map((option) => (
                <button
                  key={option.days}
                  type="button"
                  className={MENU_ITEM_CLASS}
                  onClick={() => {
                    setSnoozeOpen(false);
                    handlers.onSnooze(action, option.days);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </PopoverContent>
          </Popover>

          <Popover
            open={moreOpen}
            onOpenChange={(open) => {
              setMoreOpen(open);
              if (!open) setEditingTarget(false);
            }}
          >
            <PopoverTrigger asChild>
              <Button size="icon-sm" variant="ghost" aria-label="Mais opções" disabled={handlers.busy}>
                <MoreHorizontal aria-hidden />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className={cn(editingTarget ? "p-3" : "w-64 p-1")}>
              {editingTarget ? (
                <RotinaListingTargetForm
                  catalogListing={listing.catalogListing}
                  defaults={{
                    minMarginPercent: listing.minMarginPercent,
                    tacosTargetPercent: listing.tacosTargetPercent,
                  }}
                  current={{
                    minMarginPercent: listing.minMarginOverridden ? listing.minMarginPercent : null,
                    tacosTargetPercent: listing.tacosOverridden ? listing.tacosTargetPercent : null,
                  }}
                  saving={savingTarget}
                  onCancel={() => setEditingTarget(false)}
                  onSave={async (draft) => {
                    setSavingTarget(true);
                    const ok = await handlers.onSaveTarget(action, draft);
                    setSavingTarget(false);
                    if (ok) {
                      setEditingTarget(false);
                      setMoreOpen(false);
                    }
                  }}
                />
              ) : (
                <>
                  <button
                    type="button"
                    className={MENU_ITEM_CLASS}
                    onClick={() => setEditingTarget(true)}
                  >
                    <Target className="size-4" aria-hidden />
                    Meta deste anúncio
                    {listing.minMarginOverridden || listing.tacosOverridden ? (
                      <span className="ml-auto text-[10px] text-[var(--muted-foreground)]">
                        própria
                      </span>
                    ) : null}
                  </button>
                  {listing.hasHealth ? (
                    <button
                      type="button"
                      className={MENU_ITEM_CLASS}
                      onClick={() => {
                        setMoreOpen(false);
                        handlers.onRecalculate(listing.mlItemId);
                      }}
                    >
                      <RefreshCw className="size-4" aria-hidden />
                      Recalcular este anúncio
                    </button>
                  ) : null}
                  <div className="my-1 h-px bg-[var(--border)]" role="separator" />
                  <button
                    type="button"
                    className={MENU_ITEM_CLASS}
                    onClick={() => {
                      setMoreOpen(false);
                      handlers.onDismiss(action);
                    }}
                  >
                    <EyeOff className="size-4" aria-hidden />
                    <span className="min-w-0">
                      Ignorar &quot;{definition.settingsLabel}&quot; neste anúncio
                    </span>
                  </button>
                </>
              )}
            </PopoverContent>
          </Popover>

          <Button
            size="sm"
            variant="secondary"
            onClick={() => handlers.onDone(action)}
            disabled={handlers.busy}
            className="hover:bg-emerald-50 hover:text-emerald-800"
          >
            <Check aria-hidden />
            {action.kind === "event" ? "Ciente" : "Feito"}
          </Button>
        </div>
      </div>

      {simulator && simulating ? (
        <div className="border-t border-[var(--border)] bg-[var(--muted)]/20 px-3 pb-3 sm:px-4 sm:pb-4">
          <RotinaPriceSimulator
            mlItemId={listing.mlItemId}
            suggestions={simulator.suggestions}
            defaultPrice={simulator.defaultPrice}
            timeZone={timeZone}
          />
        </div>
      ) : null}
    </li>
  );
}
