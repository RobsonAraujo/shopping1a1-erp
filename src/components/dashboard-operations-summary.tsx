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
  const purchaseParts: string[] = [];
  const fullParts: string[] = [];

  const p = summary.purchase;
  if (p.attention > 0) {
    purchaseParts.push(countLabel(p.attention, "em entrada", "em entrada"));
  }
  if (p.analyzing + p.quoted > 0) {
    purchaseParts.push(
      countLabel(
        p.analyzing + p.quoted,
        "em andamento",
        "em andamento",
      ),
    );
  }
  if (p.ordered > 0) {
    purchaseParts.push(countLabel(p.ordered, "comprado", "comprados"));
  }

  const f = summary.full;
  if (f.attention > 0) {
    fullParts.push(countLabel(f.attention, "Full em entrada", "Full em entrada"));
  }
  if (f.scheduled > 0) {
    fullParts.push(countLabel(f.scheduled, "Full agendado", "Full agendados"));
  }
  if (f.collected > 0) {
    fullParts.push(countLabel(f.collected, "Full coletado", "Full coletados"));
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

  const urgentPurchase = p.attention;

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
              {urgentPurchase > 0 ? (
                <p className="mt-1 text-sm font-medium text-amber-800">
                  {countLabel(
                    urgentPurchase,
                    "anúncio precisa",
                    "anúncios precisam",
                  )}{" "}
                  de ação imediata na compra.
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
