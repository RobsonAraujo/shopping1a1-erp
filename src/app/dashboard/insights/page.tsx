import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  Lightbulb,
  Map,
  PieChart,
  TrendingDown,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  getSessionAccessState,
  readSession,
  refreshSessionPath,
} from "@/lib/mercadolibre/session";
import { loadDashboardPurchaseData } from "@/lib/dashboard-purchase-data";
import { loadLatestTaxReportSnapshot } from "@/lib/tax-report/service/generate-monthly-report";
import { mapToSlowMoverRows, DEFAULT_SLOW_MOVER_THRESHOLD_DAYS } from "@/lib/insights/slow-movers";
import { buildRupturaRows } from "@/lib/insights/ruptura";
import { buildDifalMap } from "@/lib/insights/difal-map";
import { buildParetoRows, paretoConcentration } from "@/lib/insights/pareto";
import { InsightExpandableCard } from "@/components/insights/insight-expandable-card";
import { SlowMoversCard } from "@/components/insights/slow-movers-card";
import { RupturaCard } from "@/components/insights/ruptura-card";
import { AdsMargemCard } from "@/components/insights/ads-margem-card";
import { DifalMapCard } from "@/components/insights/difal-map-card";
import { ParetoCard } from "@/components/insights/pareto-card";

const MONTH_NAMES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

function plural(n: number, singular: string, plural_: string) {
  return `${n} ${n === 1 ? singular : plural_}`;
}

export default async function InsightsPage() {
  const cookieStore = await cookies();
  const session = getSessionAccessState(cookieStore);
  if (session.needsRefresh) {
    redirect(refreshSessionPath("/dashboard/insights"));
  }
  const token = session.accessToken;
  const { userId } = readSession(cookieStore);

  if (!token || userId === undefined) return null;

  const [purchaseData, taxSnapshot] = await Promise.all([
    loadDashboardPurchaseData(token, userId).catch(() => null),
    loadLatestTaxReportSnapshot(userId).catch(() => null),
  ]);

  const allSlowMoverRows = purchaseData ? mapToSlowMoverRows(purchaseData.rows) : [];
  const rupturaRows = purchaseData ? buildRupturaRows(purchaseData.rows) : [];
  const difalRows = taxSnapshot ? buildDifalMap(taxSnapshot) : [];
  const paretoRows = taxSnapshot ? buildParetoRows(taxSnapshot) : [];

  const taxPeriod = taxSnapshot
    ? `${MONTH_NAMES[taxSnapshot.month - 1]}/${taxSnapshot.year}`
    : null;

  // Badges calculados no servidor
  const slowCount = allSlowMoverRows.filter(
    (r) =>
      r.performanceTier === "zero" ||
      (r.coverageDays !== null && r.coverageDays > DEFAULT_SLOW_MOVER_THRESHOLD_DAYS),
  ).length;

  const rupturaCount = rupturaRows.length;
  const rupturaUrgent = rupturaRows.filter((r) => (r.coverageDays ?? 0) <= 7).length;

  const worstDifalUf = difalRows.find((r) => r.margemMedia < 0);

  const { top3Percent, skusFor80Percent } = paretoRows.length > 0
    ? paretoConcentration(paretoRows)
    : { top3Percent: 0, skusFor80Percent: 0 };
  const highConcentration = top3Percent > 60;

  return (
    <div className="space-y-6">
      <header className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-yellow-100 text-yellow-900 shadow-sm">
          <Lightbulb className="size-6" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-[var(--primary)]">
            Insights
          </h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-[var(--muted-foreground)]">
            Clique em qualquer card para ver os detalhes. Itens críticos abrem automaticamente.
          </p>
        </div>
      </header>

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
            <a href="/dashboard/relatorio-tributario" className="underline font-medium">
              Tributário
            </a>{" "}
            para ver os insights de DIFAL e Pareto.
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {purchaseData && (
          <>
            <InsightExpandableCard
              title="Ruptura iminente"
              subtitle="Produtos que vão acabar antes de chegar a reposição"
              icon={<AlertTriangle className="size-4" aria-hidden />}
              iconClassName="bg-red-100 text-red-700"
              accentClassName="border-l-red-500"
              badge={
                rupturaCount > 0
                  ? rupturaUrgent > 0
                    ? `${rupturaUrgent} crítico${rupturaUrgent !== 1 ? "s" : ""}`
                    : plural(rupturaCount, "produto", "produtos")
                  : "tudo ok"
              }
              badgeVariant={rupturaCount > 0 ? (rupturaUrgent > 0 ? "destructive" : "warning") : "success"}
              defaultOpen={rupturaCount > 0}
            >
              <RupturaCard rows={rupturaRows} />
            </InsightExpandableCard>

            <InsightExpandableCard
              title="Rotação baixa"
              subtitle={`Produtos com cobertura acima de ${DEFAULT_SLOW_MOVER_THRESHOLD_DAYS} dias ou sem vendas no período`}
              icon={<TrendingDown className="size-4" aria-hidden />}
              iconClassName="bg-orange-100 text-orange-700"
              accentClassName="border-l-orange-400"
              badge={slowCount > 0 ? plural(slowCount, "produto", "produtos") : "tudo ok"}
              badgeVariant={slowCount > 0 ? "warning" : "success"}
            >
              <SlowMoversCard allRows={allSlowMoverRows} />
            </InsightExpandableCard>
          </>
        )}

        <AdsMargemCard />

        {taxSnapshot && taxPeriod && (
          <>
            <InsightExpandableCard
              title="Margem por estado (DIFAL)"
              subtitle={`Impacto do DIFAL na margem por UF de destino — ${taxPeriod}`}
              icon={<Map className="size-4" aria-hidden />}
              iconClassName="bg-blue-100 text-blue-700"
              accentClassName="border-l-blue-400"
              badge={
                worstDifalUf
                  ? `${worstDifalUf.uf} negativo`
                  : plural(difalRows.length, "estado", "estados")
              }
              badgeVariant={worstDifalUf ? "destructive" : "secondary"}
            >
              <DifalMapCard rows={difalRows} />
            </InsightExpandableCard>

            <InsightExpandableCard
              title="Concentração de receita (Pareto)"
              subtitle={`${taxPeriod} — ${skusFor80Percent} SKU${skusFor80Percent !== 1 ? "s" : ""} respondem por 80% da receita`}
              icon={<PieChart className="size-4" aria-hidden />}
              iconClassName="bg-indigo-100 text-indigo-700"
              accentClassName="border-l-indigo-400"
              badge={
                highConcentration
                  ? `top 3 = ${top3Percent.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`
                  : plural(paretoRows.length, "SKU", "SKUs")
              }
              badgeVariant={highConcentration ? "warning" : "secondary"}
            >
              <ParetoCard rows={paretoRows} />
            </InsightExpandableCard>
          </>
        )}
      </div>
    </div>
  );
}
