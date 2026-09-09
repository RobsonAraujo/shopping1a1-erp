import { CheckCircle2, HelpCircle, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

const BUCKETS = [
  {
    key: "lucrativos",
    label: "Lucrativos",
    count: 68,
    icon: CheckCircle2,
    barClass: "bg-emerald-500",
    textClass: "text-white",
    labelClass: "text-white/85",
    tileClass: "border-transparent bg-emerald-500",
  },
  {
    key: "prejuizo",
    label: "No prejuízo",
    count: 9,
    icon: TrendingDown,
    barClass: "bg-rose-500",
    textClass: "text-white",
    labelClass: "text-white/85",
    tileClass: "border-transparent bg-rose-500",
  },
  {
    key: "sem-custo",
    label: "Sem custo cadastrado",
    count: 3,
    icon: HelpCircle,
    barClass: "bg-slate-300",
    textClass: "text-slate-700",
    labelClass: "text-slate-500",
    tileClass: "border-slate-200 bg-slate-50",
  },
] as const;

const TOTAL = BUCKETS.reduce((sum, b) => sum + b.count, 0);

export function DemoLucratividadeSummary() {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
      <p className="text-sm font-medium text-[var(--muted-foreground)]">
        {TOTAL} anúncios ativos, de relance
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {BUCKETS.map((bucket) => {
          const Icon = bucket.icon;
          return (
            <div
              key={bucket.key}
              className={cn("rounded-xl border px-4 py-3", bucket.tileClass)}
            >
              <div className={cn("flex items-center gap-1.5 text-xs font-medium", bucket.labelClass)}>
                <Icon className="size-3.5" aria-hidden />
                {bucket.label}
              </div>
              <p className={cn("mt-1 text-2xl font-bold tabular-nums", bucket.textClass)}>
                {bucket.count}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--muted)]" aria-hidden>
        {BUCKETS.map((bucket) => (
          <div
            key={bucket.key}
            className={bucket.barClass}
            style={{ width: `${(bucket.count / TOTAL) * 100}%` }}
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-[var(--muted-foreground)]">
        Descubra em segundos onde está o prejuízo e quais anúncios ainda
        precisam de custo cadastrado — antes que isso vire uma surpresa no DRE.
      </p>
    </div>
  );
}
