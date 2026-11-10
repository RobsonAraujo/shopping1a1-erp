"use client";

import { ListChecks, RefreshCw, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ActionSummary } from "@/lib/rotina/view-summary";

/** Cabeçalho do dia: data, progresso, última atualização, Metas e Atualizar. */
export function RotinaHeader({
  todayLabel,
  summary,
  lastCompleteRunLabel,
  onRefresh,
  onOpenTargets,
  busy,
}: {
  todayLabel: string;
  summary: ActionSummary;
  lastCompleteRunLabel: string | null;
  onRefresh: () => void;
  onOpenTargets: () => void;
  busy: boolean;
}) {
  const totalToday = summary.active + summary.doneToday;
  const percent = totalToday > 0 ? Math.round((summary.doneToday / totalToday) * 100) : 0;
  const label = todayLabel.charAt(0).toUpperCase() + todayLabel.slice(1);

  return (
    <header className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-5 py-5 sm:px-8 sm:py-6">
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
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant="outline" onClick={onOpenTargets} disabled={busy}>
            <Target aria-hidden />
            Metas
          </Button>
          <Button onClick={onRefresh} disabled={busy}>
            <RefreshCw aria-hidden />
            Atualizar
          </Button>
        </div>
      </div>

      <div className="mt-5">
        <p className="text-sm text-[var(--foreground)]">
          <span className="font-semibold tabular-nums">{summary.active}</span>{" "}
          {summary.active === 1 ? "ação para hoje" : "ações para hoje"}
          {summary.newToday > 0 ? (
            <>
              {" · "}
              <span className="font-semibold tabular-nums">{summary.newToday}</span>{" "}
              {summary.newToday === 1 ? "nova" : "novas"}
            </>
          ) : null}
          {" · "}
          <span className="font-semibold tabular-nums">{summary.doneToday}</span>{" "}
          {summary.doneToday === 1 ? "feita" : "feitas"}
        </p>
        <div
          className="mt-2 h-1.5 w-full max-w-md overflow-hidden rounded-full bg-[var(--muted)]"
          role="progressbar"
          aria-label="Ações feitas hoje"
          aria-valuemin={0}
          aria-valuemax={totalToday}
          aria-valuenow={summary.doneToday}
        >
          <div
            className="h-full rounded-full bg-emerald-600 transition-[width] duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">
          Margem, preço mínimo, ADS e promoções:{" "}
          {lastCompleteRunLabel ? `atualizados ${lastCompleteRunLabel}` : "ainda não lidos"}.
          {" "}Status do catálogo: ao vivo.
        </p>
      </div>
    </header>
  );
}
