"use client";

import { DashboardCatalogLosingPanel } from "@/components/home/DashboardCatalogLosingPanel";
import { DashboardOnboardingChecklist } from "@/components/home/DashboardOnboardingChecklist";
import { DashboardSalesCard } from "@/components/home/DashboardSalesCard";
import {
  useHomeCore,
  useHomeSellerCard,
} from "@/components/home/dashboard/HomeDashboardProvider";

/**
 * Adapters de uma linha: leem o contexto e entregam ao componente que já
 * existia. Nenhum desses componentes foi tocado — a plataforma de widgets
 * embrulha, não reescreve.
 */

export function HomeWidgetVendasKpi() {
  // O card já vem renderizado do servidor, dentro do seu próprio `<Suspense>`:
  // o `fetchMe` streama e a grade não espera pelo Mercado Livre. O fallback
  // cobre o caso de a página não ter fornecido o nó (ex.: em teste).
  return useHomeSellerCard() ?? <DashboardSalesCard pending />;
}

export function HomeWidgetOnboarding() {
  const { onboarding } = useHomeCore();
  if (!onboarding) return null;
  return <DashboardOnboardingChecklist state={onboarding} />;
}

export function HomeWidgetCatalogoPerdendo() {
  const { catalogLosing } = useHomeCore();
  return (
    <DashboardCatalogLosingPanel
      preview={catalogLosing.rows}
      total={catalogLosing.total}
    />
  );
}
