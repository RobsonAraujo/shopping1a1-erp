import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { CalculatorPageClient } from "@/components/calculadora/CalculatorPageClient";
import { CalculatorPageHeader } from "@/components/calculadora/CalculatorPageHeader";
import { CalculatorSkeleton } from "@/components/calculadora/CalculatorSkeleton";
import { UserFeedback } from "@/components/ui/user-feedback";
import { publicPageLoadMessage } from "@/lib/infra/server-public-error";
import { readSession } from "@/lib/mercadolibre/session";
import { getOrganizationContext } from "@/lib/organizations/context";
import { normalizeListingParam } from "@/lib/rotina/calculator-listings";
import { loadCalculatorListings } from "@/lib/rotina/calculator-listings-data";

const LOAD_ERROR_MESSAGE =
  "Não foi possível carregar a Calculadora agora. Tente de novo em instantes.";

export const metadata: Metadata = {
  title: "Calculadora de preço",
};

/** Só banco: o ML só é chamado quando o usuário simula um preço. */
async function CalculatorSection({
  organizationId,
  initialSelectedId,
}: {
  organizationId: string;
  initialSelectedId: string | null;
}) {
  let data: Awaited<ReturnType<typeof loadCalculatorListings>>;
  try {
    data = await loadCalculatorListings(organizationId);
  } catch (e) {
    return (
      <UserFeedback title="Não foi possível carregar a Calculadora">
        {publicPageLoadMessage("dashboard/calculadora", e, LOAD_ERROR_MESSAGE)}
      </UserFeedback>
    );
  }
  return (
    <div className="space-y-5">
      <CalculatorPageHeader
        lastCompleteRunLabel={data.lastCompleteRunLabel}
        dataIsFromToday={data.dataIsFromToday}
      />
      <CalculatorPageClient data={data} initialSelectedId={initialSelectedId} />
    </div>
  );
}

export default async function CalculadoraPage({
  searchParams,
}: {
  // `searchParams` é Promise no Next 16 — precisa de `await`.
  searchParams: Promise<{ anuncio?: string | string[] }>;
}) {
  const cookieStore = await cookies();
  const { accessToken: token, userId } = readSession(cookieStore);
  if (!token || userId === undefined) return null;

  const orgContext = await getOrganizationContext();
  if (orgContext.status !== "active") return null;

  const { anuncio } = await searchParams;
  const initialSelectedId = normalizeListingParam(Array.isArray(anuncio) ? anuncio[0] : anuncio);

  return (
    <Suspense
      fallback={
        <div className="space-y-5">
          <CalculatorPageHeader />
          <CalculatorSkeleton />
        </div>
      }
    >
      <CalculatorSection
        organizationId={orgContext.organization.id}
        initialSelectedId={initialSelectedId}
      />
    </Suspense>
  );
}
