import Link from "next/link";
import { Kanban, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { OperationsSummaryCounts } from "@/lib/compras/replenishment-cycle";

type DashboardOperationsSummaryProps = {
  summary: OperationsSummaryCounts;
};

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function DashboardOperationsSummary({
  summary,
}: DashboardOperationsSummaryProps) {
  const purchaseParts: string[] = [];
  const fullParts: string[] = [];

  const p = summary.purchase;
  if (p.inProgress > 0) {
    purchaseParts.push(countLabel(p.inProgress, "em andamento", "em andamento"));
  }
  if (p.final > 0) {
    purchaseParts.push(countLabel(p.final, "comprado", "comprados"));
  }

  const f = summary.full;
  if (f.inProgress > 0) {
    fullParts.push(countLabel(f.inProgress, "Full em andamento", "Full em andamento"));
  }
  if (f.final > 0) {
    fullParts.push(countLabel(f.final, "Full coletado", "Full coletados"));
  }

  const sections: string[] = [];
  if (purchaseParts.length > 0) {
    sections.push(`Compra: ${purchaseParts.join(" · ")}`);
  }
  if (fullParts.length > 0) {
    sections.push(`Full: ${fullParts.join(" · ")}`);
  }

  const summaryText =
    sections.length > 0
      ? sections.join(" · ")
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
                Reposição de compra
              </h2>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                {summaryText}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:items-end">
            <Button asChild className="gap-2">
              <Link href="/dashboard/compras?tab=kanban">
                Kanban de compra
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
            <Button asChild variant="outline" className="gap-2">
              <Link href="/dashboard/operacoes-full">
                Operações Full
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
