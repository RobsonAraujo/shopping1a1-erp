"use client";

import { FlaskConical, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import {
  LUCRATIVIDADE_MAX_CUSTOM_DAYS,
  LUCRATIVIDADE_PERIOD_PRESETS,
  formatYmdRangeShort,
  type LucratividadePeriodPreset,
  type LucratividadeView,
} from "@/lib/lucratividade/period-presets";
import { cn } from "@/lib/utils";

function chipClass(active: boolean) {
  return cn(
    "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
    active
      ? "border-[var(--primary)]/40 bg-[var(--primary)]/10 text-[var(--primary)]"
      : "border-[var(--border)] bg-[var(--background)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
  );
}

/**
 * Escolha da visão: períodos de vendas reais (chips + personalizado) ou a
 * simulação no preço de hoje, separada à direita pra não parecer "mais um
 * período".
 */
export function PeriodBar({
  view,
  range,
  customRange,
  loading,
  statusText,
  onSelectPreset,
  onCommitCustom,
  onSelectSimulation,
  onReload,
}: {
  view: LucratividadeView;
  /** Intervalo aplicado (null na simulação). */
  range: { from: string; to: string } | null;
  customRange: { from: string; to: string };
  loading: boolean;
  /** Ex.: "Buscando vendas… 350 de 1.200 pedidos". */
  statusText: string | null;
  onSelectPreset: (preset: LucratividadePeriodPreset) => void;
  onCommitCustom: (from: string, to: string) => void;
  onSelectSimulation: () => void;
  onReload: () => void;
}) {
  const isCustom = view === "custom";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="Período de vendas"
          className="flex flex-wrap items-center gap-2"
        >
          {LUCRATIVIDADE_PERIOD_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              aria-pressed={view === preset.id}
              className={chipClass(view === preset.id)}
              onClick={() => onSelectPreset(preset.id)}
            >
              {preset.label}
            </button>
          ))}
          <DateRangePicker
            fromYmd={customRange.from}
            toYmd={customRange.to}
            onCommit={onCommitCustom}
            maxDays={LUCRATIVIDADE_MAX_CUSTOM_DAYS}
            triggerLabel={
              isCustom
                ? formatYmdRangeShort(customRange.from, customRange.to)
                : "Personalizado"
            }
            className={cn(chipClass(isCustom), "h-9 font-medium")}
          />
        </div>

        <span
          className="mx-1 hidden h-6 w-px bg-[var(--border)] sm:block"
          aria-hidden
        />

        <button
          type="button"
          aria-pressed={view === "simulation"}
          className={chipClass(view === "simulation")}
          onClick={onSelectSimulation}
          title="Todos os anúncios no preço de hoje, inclusive os que não venderam. Não é a margem real."
        >
          <FlaskConical className="size-4" aria-hidden />
          Simulação · preço de hoje
        </button>

        <div className="ml-auto flex items-center gap-2">
          {range ? (
            <span className="text-xs tabular-nums text-[var(--muted-foreground)]">
              {formatYmdRangeShort(range.from, range.to)}
            </span>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={onReload}
            disabled={loading}
            aria-label="Recalcular"
            title="Recalcular (busca de novo no Mercado Livre)"
          >
            <RefreshCw
              className={cn("size-4", loading && "animate-spin")}
              aria-hidden
            />
          </Button>
        </div>
      </div>
      {statusText ? (
        <p
          className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]"
          role="status"
        >
          <RefreshCw className="size-3.5 animate-spin" aria-hidden />
          {statusText}
        </p>
      ) : null}
    </div>
  );
}
