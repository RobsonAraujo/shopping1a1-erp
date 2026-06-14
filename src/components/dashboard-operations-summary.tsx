import Link from "next/link";
import { Kanban, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { OperationsSummaryCounts } from "@/lib/replenishment-cycle";

type DashboardOperationsSummaryProps = {
  summary: OperationsSummaryCounts;
};

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function DashboardOperationsSummary({
  summary,
}: DashboardOperationsSummaryProps) {
  const parts: string[] = [];

  if (summary.attention > 0) {
    parts.push(countLabel(summary.attention, "em atenção", "em atenção"));
  }
  if (summary.ordered > 0) {
    parts.push(countLabel(summary.ordered, "comprado", "comprados"));
  }
  if (summary.inWarehouse > 0) {
    parts.push(countLabel(summary.inWarehouse, "no galpão", "no galpão"));
  }
  if (summary.fullPending > 0) {
    parts.push(countLabel(summary.fullPending, "enviar Full", "enviar Full"));
  }
  if (summary.analyzing + summary.quoted > 0) {
    parts.push(
      countLabel(
        summary.analyzing + summary.quoted,
        "em andamento",
        "em andamento",
      ),
    );
  }

  const summaryText =
    parts.length > 0
      ? parts.join(" · ")
      : "Nenhuma reposição ativa no momento.";

  return (
    <section id="prioridades" className="scroll-mt-24">
      <Card className="overflow-hidden border-sky-200/90 bg-gradient-to-br from-sky-50/80 via-white to-[var(--card)] shadow-md ring-1 ring-sky-100/70">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-900">
              <Kanban className="size-5" aria-hidden />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-[var(--primary)]">
                Operações de reposição
              </h2>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                {summaryText}
              </p>
              {summary.attention > 0 ? (
                <p className="mt-1 text-sm font-medium text-amber-800">
                  {countLabel(summary.attention, "anúncio precisa", "anúncios precisam")} de ação imediata.
                </p>
              ) : null}
            </div>
          </div>
          <Button asChild className="shrink-0 gap-2">
            <Link href="/dashboard/operacoes">
              Abrir operações
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
