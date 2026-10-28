import type { Metadata } from "next";
import { Suspense } from "react";
import { MonthlyTaxReportClient } from "@/components/relatorio-tributario/MonthlyTaxReportClient";
import { MonthlyTaxReportSkeleton } from "@/components/relatorio-tributario/MonthlyTaxReportSkeleton";
import { UserFeedback } from "@/components/ui/user-feedback";
import { loadTaxCompanyConfig } from "@/lib/tax-report/tax-config-data";
import { loadTaxFixedCostItemsWithMonthValue } from "@/lib/tax-report/tax-fixed-cost-data";
import { loadTaxReportScreen } from "@/lib/tax-report/service/tax-report-screen";
import { stripTransacoesForResponse } from "@/lib/tax-report/strip-transacoes-for-response";
import type { TaxReportScreenStatus } from "@/lib/tax-report/types";
import { getZonedYearMonth } from "@/lib/mercadolibre/revenue-periods";
import { getOrganizationContext } from "@/lib/organizations/context";
import { publicPageLoadMessage } from "@/lib/infra/server-public-error";

async function RelatorioTributarioDataSection({
  userId,
  organizationId,
}: {
  userId: number;
  organizationId: string;
}) {
  const { year, month } = getZonedYearMonth();

  let companyTaxRegime: string | null = null;
  let loadError: string | null = null;
  try {
    companyTaxRegime = (await loadTaxCompanyConfig(organizationId)).taxRegime;
  } catch (e) {
    loadError = publicPageLoadMessage(
      "dashboard/relatorio-tributario",
      e,
      "Não foi possível carregar a configuração tributária agora. Tente de novo em instantes.",
    );
  }

  if (loadError) {
    return (
      <UserFeedback title="Não foi possível carregar o relatório">{loadError}</UserFeedback>
    );
  }

  // Simples Nacional não usa esta apuração — evita buscar custos fixos e
  // relatório (o motor de Lucro Real) pra um regime que nunca vai exibi-los.
  if (companyTaxRegime && companyTaxRegime !== "LUCRO_REAL") {
    return (
      <MonthlyTaxReportClient
        initialYear={year}
        initialMonth={month}
        initialCompanyTaxRegime={companyTaxRegime}
        initialFixedCostItems={[]}
        initialReport={null}
        initialReportStatus={null}
      />
    );
  }

  let fixedCostItems: Awaited<ReturnType<typeof loadTaxFixedCostItemsWithMonthValue>> = [];
  let report: ReturnType<typeof stripTransacoesForResponse> | null = null;
  let reportStatus: TaxReportScreenStatus | null = null;
  try {
    const [items, screen] = await Promise.all([
      loadTaxFixedCostItemsWithMonthValue(organizationId, year, month),
      loadTaxReportScreen({ organizationId, sellerId: userId, year, month }),
    ]);
    fixedCostItems = items;
    report = screen ? stripTransacoesForResponse(screen.payload) : null;
    reportStatus = screen?.status ?? null;
  } catch (e) {
    loadError = publicPageLoadMessage(
      "dashboard/relatorio-tributario",
      e,
      "Não foi possível carregar o relatório agora. Tente de novo em instantes.",
    );
  }

  if (loadError) {
    return (
      <UserFeedback title="Não foi possível carregar o relatório">{loadError}</UserFeedback>
    );
  }

  return (
    <MonthlyTaxReportClient
      initialYear={year}
      initialMonth={month}
      initialCompanyTaxRegime={companyTaxRegime}
      initialFixedCostItems={fixedCostItems}
      initialReport={report}
      initialReportStatus={reportStatus}
    />
  );
}

export const metadata: Metadata = {
  title: "Tributário",
};

export default async function RelatorioTributarioPage() {
  const orgContext = await getOrganizationContext();
  if (orgContext.status !== "active") {
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--primary)]">
          Relatório tributário mensal
        </h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-[var(--muted-foreground)]">
          Apuração por venda com PIS/COFINS e ICMS/DIFAL (Lucro Real). Cada linha
          mostra de onde vêm os números.
        </p>
      </div>
      <Suspense fallback={<MonthlyTaxReportSkeleton />}>
        <RelatorioTributarioDataSection
          userId={orgContext.mlUserId}
          organizationId={orgContext.organization.id}
        />
      </Suspense>
    </div>
  );
}
