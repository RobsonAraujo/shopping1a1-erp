import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Área do relatório (KPIs e tabela por SKU) enquanto os dados chegam. `label`
 * diz o que está carregando na troca de mês, em que a barra de filtros continua
 * na tela.
 */
export function MonthlyTaxReportBodySkeleton({ label }: { label?: string }) {
  return (
    <div
      className="space-y-4"
      role="status"
      aria-busy="true"
      aria-label={label ?? "Carregando relatório"}
    >
      {label ? (
        <p className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
          <Loader2
            className="size-4 animate-spin text-[var(--primary)]"
            aria-hidden
          />
          {label}
        </p>
      ) : null}
      <Card className="overflow-hidden p-0">
        <div className="grid gap-0 md:grid-cols-[1fr_auto]">
          <div className="space-y-4 p-5">
            <div className="grid gap-5 sm:grid-cols-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-9 w-44" />
                  <Skeleton className="h-3 w-52 max-w-full" />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-24 rounded-full" />
              ))}
            </div>
          </div>
          <div className="space-y-2 border-t border-[var(--border)] p-5 md:min-w-[17rem] md:border-t-0 md:border-l">
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-3 w-48 max-w-full" />
          </div>
        </div>
      </Card>
      <Card className="space-y-3 p-4">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-64 w-full" />
      </Card>
    </div>
  );
}

export function MonthlyTaxReportSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-16 w-full rounded-lg" />
      <MonthlyTaxReportBodySkeleton />
    </div>
  );
}
