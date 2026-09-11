import Link from "next/link";
import { ArrowUpRight, Kanban, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OperationsSummaryCounts } from "@/lib/compras/replenishment-cycle";

function OpTile({
  href,
  title,
  inProgress,
  final,
  finalLabel,
  icon: Icon,
  featured,
}: {
  href: string;
  title: string;
  inProgress: number;
  final: number;
  finalLabel: string;
  icon: typeof ShoppingCart;
  featured?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex min-h-[9.5rem] flex-col justify-between rounded-3xl p-5 sm:min-h-[11rem] sm:p-6",
        featured
          ? "bg-[var(--primary)] text-white"
          : "border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between text-sm font-medium",
          featured ? "text-white/75" : "text-[var(--muted-foreground)]",
        )}
      >
        <span className="inline-flex items-center gap-2">
          <Icon className="size-4" aria-hidden />
          {title}
        </span>
        <ArrowUpRight
          className={cn(
            "size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5",
            featured ? "text-white/70" : "text-[var(--muted-foreground)]",
          )}
          aria-hidden
        />
      </div>
      <div>
        <p className="text-4xl font-semibold tabular-nums tracking-tight sm:text-5xl">
          {inProgress}
        </p>
        <p
          className={cn(
            "mt-1 text-sm",
            featured ? "text-white/70" : "text-[var(--muted-foreground)]",
          )}
        >
          em andamento
          {final > 0 ? ` · ${final} ${finalLabel}` : ""}
        </p>
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
        featured
      />
      <OpTile
        href="/dashboard/operacoes-full"
        title="Full"
        inProgress={summary.full.inProgress}
        final={summary.full.final}
        finalLabel={summary.full.final === 1 ? "coletado" : "coletados"}
        icon={Kanban}
      />
    </section>
  );
}
