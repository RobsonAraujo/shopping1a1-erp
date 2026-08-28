"use client";

import { RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatFinancialMoney, formatFinancialPercent } from "@/lib/financial-margin";
import type { Rbt12Result } from "@/lib/simples-nacional/types";
import type { StatusTone } from "@/lib/ui/tone";
import { cn } from "@/lib/utils";

const MONTH_NAMES = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

const TONE_BADGE_VARIANT: Record<StatusTone, "success" | "warning" | "destructive" | "muted"> = {
  ok: "success",
  warning: "warning",
  danger: "destructive",
  neutral: "muted",
};

function formatDateBr(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

export function SimplesRbt12Panel({
  result,
  simplesAliquotaEfetivaPercent,
  loading,
  onRefresh,
}: {
  result: Rbt12Result | null;
  simplesAliquotaEfetivaPercent: number | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  if (!result) {
    return (
      <Card className="p-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-3 h-8 w-56" />
        <Skeleton className="mt-3 h-4 w-full" />
      </Card>
    );
  }

  const { faixa, rbt12Total, aliquotaEfetivaNominal, proximidadeLimite, months, oldestComputedAt } =
    result;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-[var(--muted-foreground)]">
            RBT12 (últimos 12 meses) — Anexo I
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {formatFinancialMoney(rbt12Total)}
          </p>
        </div>
        <Badge variant={TONE_BADGE_VARIANT[proximidadeLimite.tone]} dot>
          Faixa {faixa.faixa}
        </Badge>
      </div>

      <p className="mt-3 text-sm text-[var(--muted-foreground)]">
        {proximidadeLimite.mensagem}
      </p>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted-foreground)]">
        <span>Calculado em {formatDateBr(oldestComputedAt)}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs"
          disabled={loading}
          onClick={onRefresh}
        >
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-[var(--border)] p-3">
          <p className="text-xs text-[var(--muted-foreground)]">
            Alíquota nominal da faixa
          </p>
          <p className="mt-1 text-lg font-semibold tabular-nums">
            {formatFinancialPercent(faixa.aliquotaNominalPercent)}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] p-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="cursor-help text-xs text-[var(--muted-foreground)] underline decoration-dotted">
                Alíquota efetiva calculada
              </p>
            </TooltipTrigger>
            <TooltipContent>
              (RBT12 × alíquota nominal − parcela a deduzir) / RBT12 — só
              informativo. O DAS pago usa a alíquota efetiva manual
              configurada em Configurações.
            </TooltipContent>
          </Tooltip>
          <p className="mt-1 text-lg font-semibold tabular-nums">
            {formatFinancialPercent(aliquotaEfetivaNominal)}
            {simplesAliquotaEfetivaPercent != null &&
            Math.abs(simplesAliquotaEfetivaPercent - aliquotaEfetivaNominal) > 0.5 ? (
              <span className="ml-2 text-xs font-normal text-amber-700 dark:text-amber-300">
                (configurada: {formatFinancialPercent(simplesAliquotaEfetivaPercent)})
              </span>
            ) : null}
          </p>
        </div>
      </div>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-xs font-medium text-[var(--muted-foreground)]">
          Ver receita mês a mês
        </summary>
        <ul className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
          {months.map((m) => (
            <li
              key={`${m.year}-${m.month}`}
              className="flex items-baseline gap-1.5 text-xs"
            >
              <span className="text-[var(--muted-foreground)]">
                {MONTH_NAMES[m.month - 1]}/{String(m.year).slice(2)}
              </span>
              <span className="tabular-nums">{formatFinancialMoney(m.revenue)}</span>
            </li>
          ))}
        </ul>
      </details>
    </Card>
  );
}
