import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import Link from "next/link";
import {
  Map,
  PieChart,
  TrendingDown,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { readSession } from "@/lib/mercadolibre/session";
import { getOrganizationContext } from "@/lib/organizations/context";
import { loadDashboardPurchaseData } from "@/lib/compras/dashboard-purchase-data";
import { loadLatestTaxReportSnapshot } from "@/lib/tax-report/service/generate-monthly-report";
import { mapToSlowMoverRows } from "@/lib/insights/slow-movers";
import { buildDifalMap } from "@/lib/insights/difal-map";
import { buildParetoRows, paretoConcentration } from "@/lib/insights/pareto";
import { SlowMoversInsightCard } from "@/components/insights/slow-movers-insight-card";
import { SlowMoversKpiTile } from "@/components/insights/slow-movers-kpi-tile";
import { TaxInsightsRangeSection } from "@/components/insights/tax-insights-range-section";
import { InsightsPageSkeleton } from "@/components/insights/insights-page-skeleton";

const MONTH_NAMES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

function plural(n: number, singular: string, plural_: string) {
  return `${n} ${n === 1 ? singular : plural_}`;
}

async function InsightsDataSection({
  token,
  userId,
  organizationId,
}: {
  token: string;
  userId: number;
  organizationId: string;
}) {
  const [purchaseData, taxSnapshot] = await Promise.all([
    loadDashboardPurchaseData(token, userId, organizationId).catch(() => null),
    loadLatestTaxReportSnapshot(userId).catch(() => null),
  ]);

  const allSlowMoverRows = purchaseData ? mapToSlowMoverRows(purchaseData.rows) : [];
  const difalRows = taxSnapshot ? buildDifalMap(taxSnapshot) : [];
  const paretoRows = taxSnapshot ? buildParetoRows(taxSnapshot) : [];

  const taxPeriod = taxSnapshot
    ? `${MONTH_NAMES[taxSnapshot.month - 1]}/${taxSnapshot.year}`
    : null;

  // Badges calculados no servidor
  const worstDifalUf = difalRows.find((r) => r.margemMedia < 0);

  const { top3Percent } = paretoRows.length > 0
    ? paretoConcentration(paretoRows)
    : { top3Percent: 0 };
  const highConcentration = top3Percent > 60;

  const kpis = [
    taxSnapshot && {
      key: "difal",
      label: "DIFAL",
      value: worstDifalUf ? worstDifalUf.uf : difalRows.length,
      hint: worstDifalUf ? "margem negativa" : `${plural(difalRows.length, "estado", "estados")}`,
      tone: worstDifalUf ? "destructive" : "secondary",
      icon: Map,
    },
    taxSnapshot && {
      key: "pareto",
      label: "Concentração",
      value: `${top3Percent.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`,
      hint: "receita nos top 3 SKUs",
      tone: highConcentration ? "warning" : "secondary",
      icon: PieChart,
    },
  ].filter(Boolean) as Array<{
    key: string;
    label: string;
    value: string | number;
    hint: string;
    tone: "success" | "warning" | "destructive" | "secondary";
    icon: typeof TrendingDown;
  }>;

  const toneStyles: Record<string, string> = {
    success: "text-emerald-700 dark:text-emerald-400",
    warning: "text-amber-700 dark:text-amber-400",
    destructive: "text-red-700 dark:text-red-400",
    secondary: "text-[var(--primary)]",
  };

  return (
    <>
      {(purchaseData || kpis.length > 0) && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-6 py-5 sm:px-8">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {purchaseData && <SlowMoversKpiTile allRows={allSlowMoverRows} />}
            {kpis.map(({ key, label, value, hint, tone, icon: Icon }) => (
              <div
                key={key}
                className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 px-4 py-3"
              >
                <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--muted-foreground)]">
                  <Icon className="size-3.5" aria-hidden />
                  {label}
                </div>
                <div className={cn("mt-1 text-2xl font-bold tracking-tight", toneStyles[tone])}>
                  {value}
                </div>
                <div className="mt-0.5 text-xs text-[var(--muted-foreground)]">{hint}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!purchaseData && !taxSnapshot && (
        <Card className="border-yellow-200 bg-yellow-50/50">
          <CardContent className="pt-6 text-sm text-yellow-900">
            Não foi possível carregar os dados. Verifique sua conexão com o Mercado Livre e se há
            um relatório tributário gerado.
          </CardContent>
        </Card>
      )}

      {!taxSnapshot && purchaseData && (
        <Card className="border-yellow-200 bg-yellow-50/50">
          <CardContent className="pt-6 text-sm text-yellow-900">
            Nenhum relatório tributário encontrado. Gere um em{" "}
            <Link href="/dashboard/relatorio-tributario" className="underline font-medium">
              Tributário
            </Link>{" "}
            para ver os insights de DIFAL e Pareto.
          </CardContent>
        </Card>
      )}

      <div className="space-y-8">
        {purchaseData && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
              Estoque &amp; reposição
            </h2>
            <SlowMoversInsightCard allRows={allSlowMoverRows} />
          </section>
        )}

        {taxSnapshot && taxPeriod && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
              Financeiro &amp; tributário
            </h2>
            <TaxInsightsRangeSection initialPayload={taxSnapshot} taxPeriodLabel={taxPeriod} />
          </section>
        )}
      </div>
    </>
  );
}

export const metadata: Metadata = {
  title: "Insights",
};

export default async function InsightsPage() {
  const cookieStore = await cookies();
  const { accessToken: token, userId } = readSession(cookieStore);

  if (!token || userId === undefined) return null;

  const orgContext = await getOrganizationContext();
  if (orgContext.status !== "active") return null;

  return (
    <div className="space-y-8">
      <header className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-6 py-7 sm:px-8">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--primary)] sm:text-3xl">
          Insights
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-[var(--muted-foreground)]">
          Clique em qualquer card para ver os detalhes. Itens críticos abrem automaticamente.
        </p>
      </header>

      <Suspense fallback={<InsightsPageSkeleton />}>
        <InsightsDataSection
          token={token}
          userId={userId}
          organizationId={orgContext.organization.id}
        />
      </Suspense>
    </div>
  );
}
