import type { Metadata } from "next";
import { TrendingUp } from "lucide-react";
import { FinancialEvaluationClient } from "@/components/lucratividade/FinancialEvaluationClient";
import { UserFeedback } from "@/components/ui/user-feedback";
import { getOrganizationContext } from "@/lib/organizations/context";
import { publicPageLoadMessage } from "@/lib/infra/server-public-error";
import { ensureCompanySettings } from "@/lib/products/product-data";
import { pickWholesaleReductions } from "@/lib/pricing/wholesale-pricing";

export const metadata: Metadata = {
  title: "Lucratividade",
};

export default async function LucratividadePage() {
  const orgContext = await getOrganizationContext();
  if (orgContext.status !== "active") {
    return null;
  }

  let settings: Awaited<ReturnType<typeof ensureCompanySettings>> | null = null;
  let loadError: string | null = null;
  try {
    settings = await ensureCompanySettings(orgContext.organization.id);
  } catch (e) {
    loadError = publicPageLoadMessage(
      "dashboard/lucratividade",
      e,
      "Não foi possível carregar as configurações da empresa agora. Tente de novo em instantes.",
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary)]">
          <TrendingUp className="size-5" aria-hidden />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">
            Lucratividade
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--muted-foreground)] sm:text-[15px]">
            Quanto sobra de cada venda depois de taxa ML, frete, custo e
            impostos.
          </p>
        </div>
      </div>

      {settings ? (
        <FinancialEvaluationClient
          taxContext={{
            taxRegime: settings.taxRegime,
            simplesRateConfigured: settings.simplesAliquotaEfetivaPercent != null,
          }}
          initialWholesaleReductions={pickWholesaleReductions(settings)}
        />
      ) : (
        <UserFeedback title="Não foi possível carregar a Lucratividade">
          {loadError}
        </UserFeedback>
      )}
    </div>
  );
}
