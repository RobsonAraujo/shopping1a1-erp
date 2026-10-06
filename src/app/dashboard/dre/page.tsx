import type { Metadata } from "next";
import { Suspense } from "react";
import { LineChart } from "lucide-react";
import { DreClient } from "@/components/dre/DreClient";
import { DreSkeleton } from "@/components/dre/DreSkeleton";
import { UserFeedback } from "@/components/ui/user-feedback";
import { loadDreYearView } from "@/lib/dre/dre-year-data";
import { loadDreDisplaySettings } from "@/lib/dre/dre-display-settings-data";
import { getZonedYearMonth } from "@/lib/mercadolibre/revenue-periods";
import { getOrganizationContext } from "@/lib/organizations/context";
import { publicPageLoadMessage } from "@/lib/infra/server-public-error";

/**
 * Resolve o ano a abrir a partir de `?ano=`.
 *
 * Existe porque a Home linka pra cá nomeando o mês da pendência, e uma pendência
 * de dezembro do ano passado caía numa tabela do ano corrente onde não havia nada
 * — o pior beco sem saída possível.
 *
 * **Lista branca, nunca `Number()` cru:** só os anos que o `FormSelect` do
 * `DreClient` oferece (corrente ±1). Qualquer outra coisa cai no ano corrente, em
 * vez de carregar um ano que o seletor não consegue mostrar de volta.
 */
function resolveYear(raw: string | undefined, currentYear: number): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  const allowed = [currentYear - 1, currentYear, currentYear + 1];
  return allowed.includes(parsed) ? parsed : currentYear;
}

async function DreDataSection({
  organizationId,
  year,
}: {
  organizationId: string;
  year: number;
}) {

  let data: Awaited<ReturnType<typeof loadDreYearView>> | null = null;
  let displaySettings: Awaited<ReturnType<typeof loadDreDisplaySettings>> | null = null;
  let loadError: string | null = null;
  try {
    [data, displaySettings] = await Promise.all([
      loadDreYearView(organizationId, year),
      loadDreDisplaySettings(organizationId),
    ]);
  } catch (e) {
    loadError = publicPageLoadMessage(
      "dashboard/dre",
      e,
      "Não foi possível carregar o DRE agora. Tente de novo em instantes.",
    );
  }

  if (loadError || !data || !displaySettings) {
    return (
      <UserFeedback title="Não foi possível carregar o DRE">
        {loadError ?? "Não foi possível carregar o DRE agora. Tente de novo em instantes."}
      </UserFeedback>
    );
  }

  return (
    <DreClient
      initialYear={year}
      initialData={data}
      initialDisplaySettings={displaySettings}
    />
  );
}

export const metadata: Metadata = {
  title: "DRE",
};

export default async function DrePage({
  searchParams,
}: {
  // `searchParams` é Promise no Next 16 — precisa de `await`.
  searchParams: Promise<{ ano?: string }>;
}) {
  const orgContext = await getOrganizationContext();
  if (orgContext.status !== "active") {
    return null;
  }

  const { ano } = await searchParams;
  const year = resolveYear(ano, getZonedYearMonth().year);

  return (
    <div className="relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[96rem] space-y-6 pb-10">
        <header className="flex items-start gap-3">
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary)]">
            <LineChart className="size-5" aria-hidden />
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
              Financeiro
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-[var(--foreground)]">
              Resultado
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-[var(--muted-foreground)]">
              DRE mensal: faturamento e custos do Mercado Livre, produto e
              impostos do ERP, custos cadastrados e ADS — do faturamento ao
              lucro operacional.
            </p>
          </div>
        </header>

        <Suspense fallback={<DreSkeleton />}>
          <DreDataSection
            organizationId={orgContext.organization.id}
            year={year}
          />
        </Suspense>
      </div>
    </div>
  );
}
