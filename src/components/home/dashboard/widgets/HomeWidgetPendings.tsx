"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import {
  HomeWidgetCard,
  HomeWidgetEmpty,
} from "@/components/home/dashboard/HomeWidgetCard";
import { useHomeCore } from "@/components/home/dashboard/HomeDashboardProvider";
import { STATUS_PILL_CLASS, type StatusTone } from "@/lib/ui/tone";
import { cn } from "@/lib/utils";


type PendingRow = {
  id: string;
  label: string;
  detail: string;
  href: string;
  tone: StatusTone;
};

function relativeLabel(iso: string | null, timezone: string): string {
  if (!iso) return "nunca rodou";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "data desconhecida";
  return date.toLocaleString("pt-BR", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Pendências operacionais do sistema — fechamento de estoque que falhou,
 * conciliação de DRE esperando, meses sem sincronizar e o monitoramento de
 * catálogo. Tudo já vem do snapshot de servidor: nenhum request extra.
 */
export function HomeWidgetPendings() {
  const { pendings, catalogPoll } = useHomeCore();

  if (!pendings) {
    return (
      <HomeWidgetCard
        definitionId="pendencias"
        error="Não foi possível verificar as pendências agora."
      />
    );
  }

  const rows: PendingRow[] = [];

  if (pendings.failedInventoryRuns > 0) {
    rows.push({
      id: "inventory",
      label:
        pendings.failedInventoryRuns === 1
          ? "1 fechamento de estoque falhou"
          : `${pendings.failedInventoryRuns} fechamentos de estoque falharam`,
      detail: "Refaça o fechamento do mês para não perder o histórico.",
      href: "/dashboard/inventory/historico",
      tone: "danger",
    });
  }

  if (pendings.pendingDreImports > 0) {
    rows.push({
      id: "reconciliation",
      label:
        pendings.pendingDreImports === 1
          ? "1 conciliação de DRE pendente"
          : `${pendings.pendingDreImports} conciliações de DRE pendentes`,
      detail: "Há uma planilha importada esperando confirmação.",
      href: "/dashboard/dre",
      tone: "warning",
    });
  }

  const unsynced = pendings.dreMonths.filter((m) => m.syncedAt === null).length;
  if (unsynced > 0) {
    rows.push({
      id: "dre-sync",
      label:
        unsynced === 1
          ? "1 mês de DRE sem sincronizar"
          : `${unsynced} meses de DRE sem sincronizar`,
      detail: "Sincronize para o resultado do mês ficar completo.",
      href: "/dashboard/dre",
      tone: "neutral",
    });
  }

  if (catalogPoll && catalogPoll.todayCount === 0) {
    rows.push({
      id: "catalog-poll",
      label: "Monitoramento de catálogo sem rodar hoje",
      detail: `Última verificação: ${relativeLabel(catalogPoll.lastRunAt, catalogPoll.timezone)}.`,
      href: "/dashboard/catalog-report",
      tone: "warning",
    });
  }

  if (rows.length === 0) {
    return (
      <HomeWidgetCard definitionId="pendencias">
        <HomeWidgetEmpty
          tone="ok"
          title="Nenhuma pendência no sistema"
          description={
            catalogPoll && catalogPoll.todayCount > 0
              ? `Monitoramento de catálogo rodou ${catalogPoll.todayCount}× hoje.`
              : "Sincronizações e fechamentos estão em dia."
          }
        />
      </HomeWidgetCard>
    );
  }

  return (
    <HomeWidgetCard definitionId="pendencias" count={rows.length}>
      <ul className="-mx-2 divide-y divide-[var(--border)]">
        {rows.map((row) => {
          const pill = STATUS_PILL_CLASS[row.tone];
          return (
            <li key={row.id}>
              <Link
                href={row.href}
                className="flex items-start gap-2.5 rounded-xl px-2 py-2.5 transition-colors hover:bg-[var(--muted)]/40"
              >
                <span
                  className={cn("mt-1.5 size-2 shrink-0 rounded-full", pill.dot)}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-[var(--foreground)]">
                    {row.label}
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-[var(--muted-foreground)]">
                    {row.detail}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {catalogPoll && catalogPoll.todayCount > 0 ? (
        <p className="mt-3 flex items-center gap-1.5 border-t border-[var(--border)] pt-3 text-xs text-[var(--muted-foreground)]">
          <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" aria-hidden />
          Monitoramento de catálogo rodou {catalogPoll.todayCount}× hoje.
        </p>
      ) : null}
    </HomeWidgetCard>
  );
}
