import Link from "next/link";
import { ArrowUpRight, Kanban, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OperationsSummaryCounts } from "@/lib/compras/replenishment-cycle";

function Metric({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-3xl font-semibold tabular-nums tracking-tight text-[var(--foreground)] sm:text-4xl">
        {value}
      </p>
      <p className="mt-1 truncate text-xs text-[var(--muted-foreground)] sm:text-sm">
        {label}
      </p>
    </div>
  );
}

function OpTile({
  href,
  title,
  inProgress,
  final,
  finalLabel,
  icon: Icon,
  stripeClassName,
}: {
  href: string;
  title: string;
  inProgress: number;
  final: number;
  finalLabel: string;
  icon: typeof ShoppingCart;
  stripeClassName: string;
}) {
  return (
    <Link
      href={href}
      className="group overflow-hidden rounded-3xl bg-[var(--card)]"
    >
      <span aria-hidden className={cn("block h-1", stripeClassName)} />
      <div className="px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-sm font-medium text-[var(--foreground)]">
            <Icon className="size-4 text-[var(--primary)]" aria-hidden />
            {title}
          </span>
          <ArrowUpRight
            className="size-4 text-[var(--muted-foreground)] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            aria-hidden
          />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Metric value={inProgress} label="em andamento" />
          <div className="border-l border-[var(--border)] pl-3 sm:pl-4">
            <Metric value={final} label={finalLabel} />
          </div>
        </div>
      </div>
    </Link>
  );
}

export function DashboardOperationsSummary({
  summary,
}: {
  summary: OperationsSummaryCounts;
}) {
  return (
    <section
      id="prioridades"
      className="grid grid-cols-2 gap-3 scroll-mt-24 sm:gap-4"
      aria-label="Reposição"
    >
      <OpTile
        href="/dashboard/compras?tab=kanban"
        title="Compras"
        inProgress={summary.purchase.inProgress}
        final={summary.purchase.final}
        finalLabel={summary.purchase.final === 1 ? "comprado" : "comprados"}
        icon={ShoppingCart}
        stripeClassName="bg-[var(--primary)]"
      />
      <OpTile
        href="/dashboard/operacoes-full"
        title="Full"
        inProgress={summary.full.inProgress}
        final={summary.full.final}
        finalLabel={summary.full.final === 1 ? "coletado" : "coletados"}
        icon={Kanban}
        stripeClassName="bg-[var(--ring)]"
      />
    </section>
  );
}
