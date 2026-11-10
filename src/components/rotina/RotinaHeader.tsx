"use client";

import { BellRing, CheckCircle2, Info, ListChecks, RefreshCw, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ActionSummary } from "@/lib/rotina/view-summary";
import { cn } from "@/lib/utils";

function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 text-2xl font-bold leading-none tabular-nums tracking-tight text-[var(--foreground)]",
          className,
        )}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * Cabeçalho do dia: data, progresso, Metas e Atualizar — e o lembrete de
 * atualizar pelo menos uma vez por dia (o "hoje" é o de São Paulo, como o resto
 * da página).
 */
export function RotinaHeader({
  todayLabel,
  summary,
  updatedToday,
  lastCompleteRunLabel,
  onRefresh,
  onOpenTargets,
  busy,
}: {
  todayLabel: string;
  summary: ActionSummary;
  updatedToday: boolean;
  lastCompleteRunLabel: string | null;
  onRefresh: () => void;
  onOpenTargets: () => void;
  busy: boolean;
}) {
  const totalToday = summary.active + summary.doneToday;
  const percent = totalToday > 0 ? Math.round((summary.doneToday / totalToday) * 100) : 0;
  const dayComplete = summary.active === 0 && summary.doneToday > 0;
  const label = todayLabel.charAt(0).toUpperCase() + todayLabel.slice(1);

  return (
    <header className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] sm:shadow-sm">
      <div className="px-5 pb-5 pt-5 sm:px-8 sm:pt-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary)]">
              <ListChecks className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">
                Central de anúncios
              </h1>
              <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">{label}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              onClick={onOpenTargets}
              disabled={busy}
              className="flex-1 sm:flex-none"
            >
              <Target aria-hidden />
              Metas
            </Button>
            <Button onClick={onRefresh} disabled={busy} className="relative flex-1 sm:flex-none">
              <RefreshCw aria-hidden />
              Atualizar
              {!updatedToday ? (
                <>
                  <span
                    className="absolute -right-1 -top-1 size-3 rounded-full border-2 border-[var(--card)] bg-amber-500"
                    aria-hidden
                  />
                  <span className="sr-only"> (ainda não atualizado hoje)</span>
                </>
              ) : null}
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-end sm:gap-10">
          <div className="grid grid-cols-3 gap-6 sm:flex sm:gap-8">
            <Stat label="Pendentes" value={summary.active} />
            <Stat
              label="Novas hoje"
              value={summary.newToday}
              className={summary.newToday > 0 ? "text-amber-700" : undefined}
            />
            <Stat
              label="Feitas hoje"
              value={summary.doneToday}
              className={summary.doneToday > 0 ? "text-emerald-700" : undefined}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-3 text-xs text-[var(--muted-foreground)]">
              <span className="font-medium">
                {dayComplete ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700">
                    <CheckCircle2 className="size-3.5" aria-hidden />
                    Dia concluído
                  </span>
                ) : (
                  "Progresso do dia"
                )}
              </span>
              <span className="tabular-nums">
                {summary.doneToday} de {totalToday}
              </span>
            </div>
            <div
              className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[var(--muted)]"
              role="progressbar"
              aria-label="Ações feitas hoje"
              aria-valuemin={0}
              aria-valuemax={Math.max(totalToday, 1)}
              aria-valuenow={summary.doneToday}
              aria-valuetext={`${summary.doneToday} de ${totalToday} ações feitas`}
            >
              <div
                className="h-full rounded-full bg-emerald-600 transition-[width] duration-500"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {updatedToday ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--border)] bg-[var(--muted)]/25 px-5 py-2.5 text-xs text-[var(--muted-foreground)] sm:px-8">
          <span className="inline-flex items-center gap-1.5 font-medium text-[var(--foreground)]">
            <span className="size-2 rounded-full bg-emerald-500" aria-hidden />
            Atualizado {lastCompleteRunLabel}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="relative flex size-2" aria-hidden>
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            Catálogo ao vivo
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="ml-auto inline-flex cursor-pointer items-center gap-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                <Info className="size-3.5" aria-hidden />
                O que é atualizado
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              Margem, preço mínimo, ADS e promoções saem do Atualizar. O status do
              catálogo é lido ao vivo, sem precisar atualizar.
            </TooltipContent>
          </Tooltip>
        </div>
      ) : (
        <div
          role="status"
          className="flex flex-col gap-3 border-t border-amber-200/80 bg-amber-50 px-5 py-3.5 sm:flex-row sm:items-center sm:px-8"
        >
          <span className="hidden size-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 sm:flex">
            <BellRing className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-amber-950">
              {lastCompleteRunLabel
                ? "Você ainda não atualizou hoje"
                : "Seus anúncios ainda não foram lidos"}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-amber-900/80">
              {lastCompleteRunLabel
                ? `Margem, ADS e promoções são de ${lastCompleteRunLabel}. Atualize pelo menos uma vez por dia para a lista refletir o dia de hoje.`
                : "A primeira atualização leva alguns minutos; o catálogo já aparece abaixo, ao vivo."}
            </p>
          </div>
          <Button size="sm" onClick={onRefresh} disabled={busy} className="shrink-0">
            <RefreshCw aria-hidden />
            Atualizar agora
          </Button>
        </div>
      )}
    </header>
  );
}
