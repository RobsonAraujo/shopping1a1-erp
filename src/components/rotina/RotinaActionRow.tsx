"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Calculator,
  Check,
  Clock,
  ExternalLink,
  EyeOff,
  ImageOff,
  MoreHorizontal,
  RefreshCw,
  Target,
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

const MENU_ITEM_CLASS =
  "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[var(--foreground)] hover:bg-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-50";

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

function Thumb({ src }: { src: string | null }) {
  return (
    <span className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-[var(--muted)]">
      {src ? (
        <Image src={src} alt="" width={48} height={48} className="size-full object-contain" sizes="48px" />
      ) : (
        <span className="flex size-full items-center justify-center">
          <ImageOff className="size-4 text-[var(--muted-foreground)]/70" aria-hidden />
        </span>
      )}
    </span>
  );
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

  return (
    <li
      className={cn(
        "rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 sm:p-4",
        RULE_ACCENT_CLASS[visual.tone],
      )}
    >
      <div className="flex gap-3">
        <Thumb src={listing.imageUrl} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <a
              href={listing.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 truncate text-sm font-semibold text-[var(--foreground)] hover:underline"
              title={listing.title}
            >
              {listing.title}
            </a>
            {visual.pill && visual.tone !== "neutral" ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold",
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
          <p className="mt-0.5 truncate text-xs text-[var(--muted-foreground)]">
            {[
              listing.sku,
              listing.mlItemId,
              listing.unitsPerDay !== null ? formatUnitsPerDay(listing.unitsPerDay) : null,
              !action.isNew ? action.ageLabel : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>

          <p className="mt-2 text-sm text-[var(--foreground)]">{action.headline}</p>
          {action.details.map((detail) => (
            <p key={detail} className="mt-0.5 text-xs text-[var(--muted-foreground)]">
              {detail}
            </p>
          ))}

          {action.related ? (
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
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
                "mt-2 text-xs font-medium",
                action.verdict.tone === "ok" && "text-emerald-800",
                action.verdict.tone === "bad" && "text-rose-800",
                action.verdict.tone === "neutral" && "text-[var(--muted-foreground)]",
              )}
            >
              {action.verdict.text}
            </p>
          ) : null}

          {action.floor ? (
            <RotinaFloorBox
              floor={action.floor}
              showDiscount={SHOW_DISCOUNT.has(action.rule)}
              onRecalculate={
                listing.hasHealth ? () => handlers.onRecalculate(listing.mlItemId) : undefined
              }
              recalculateDisabled={handlers.busy}
            />
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 sm:pl-[60px]">
        <Button asChild variant="outline" size="sm">
          <a
            href={action.related?.permalink ?? listing.permalink}
            target="_blank"
            rel="noopener noreferrer"
          >
            Abrir no ML
            <ExternalLink aria-hidden />
          </a>
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => handlers.onDone(action)}
          disabled={handlers.busy}
        >
          <Check aria-hidden />
          {action.kind === "event" ? "Ciente" : "Feito"}
        </Button>
        {simulator ? (
          <Button
            size="sm"
            variant={simulating ? "secondary" : "ghost"}
            onClick={() => setSimulating((open) => !open)}
            aria-expanded={simulating}
          >
            <Calculator aria-hidden />
            {simulator.contested && simulator.defaultPrice !== null
              ? `Simular a ${formatMoney(simulator.defaultPrice)}`
              : "Simular preço"}
          </Button>
        ) : null}

        <Popover open={snoozeOpen} onOpenChange={setSnoozeOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="ghost" disabled={handlers.busy}>
              <Clock aria-hidden />
              Adiar
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-44 p-1">
            {[
              { days: 1, label: "Até amanhã" },
              { days: 3, label: "Por 3 dias" },
              { days: 7, label: "Por 7 dias" },
            ].map((option) => (
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
      </div>

      {simulator && simulating ? (
        <div className="sm:pl-[60px]">
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
