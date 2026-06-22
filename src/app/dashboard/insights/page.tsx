import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Lightbulb } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  getSessionAccessState,
  readSession,
  refreshSessionPath,
} from "@/lib/mercadolibre/session";
import { loadDashboardPurchaseData } from "@/lib/dashboard-purchase-data";
import { loadLatestTaxReportSnapshot } from "@/lib/tax-report/service/generate-monthly-report";
import { mapToSlowMoverRows } from "@/lib/insights/slow-movers";
import { buildRupturaRows } from "@/lib/insights/ruptura";
import { buildDifalMap } from "@/lib/insights/difal-map";
import { buildParetoRows } from "@/lib/insights/pareto";
import { SlowMoversCard } from "@/components/insights/slow-movers-card";
import { RupturaCard } from "@/components/insights/ruptura-card";
import { AdsMargemCard } from "@/components/insights/ads-margem-card";
import { DifalMapCard } from "@/components/insights/difal-map-card";
import { ParetoCard } from "@/components/insights/pareto-card";

const MONTH_NAMES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

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
            Análises cruzadas para ação imediata — rotação, ruptura, ads e concentração de receita.
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

      {!taxSnapshot && (
        <Card className="border-yellow-200 bg-yellow-50/50">
          <CardContent className="pt-6 text-sm text-yellow-900">
            Nenhum relatório tributário encontrado. Gere um relatório em{" "}
            <a href="/dashboard/relatorio-tributario" className="underline font-medium">
              Tributário
            </a>{" "}
            para ver os insights de DIFAL e Pareto.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6">
        {purchaseData && (
          <>
            <SlowMoversCard allRows={allSlowMoverRows} />
            <RupturaCard rows={rupturaRows} />
          </>
        )}

        <AdsMargemCard />

        {taxSnapshot && taxPeriod && (
          <>
            <DifalMapCard rows={difalRows} period={taxPeriod} />
            <ParetoCard rows={paretoRows} period={taxPeriod} />
          </>
        )}
      </div>
    </div>
  );
}
