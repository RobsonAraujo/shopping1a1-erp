import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { RotinaPageClient } from "@/components/rotina/RotinaPageClient";
import { RotinaSkeleton } from "@/components/rotina/RotinaSkeleton";
import { UserFeedback } from "@/components/ui/user-feedback";
import { publicPageLoadMessage } from "@/lib/infra/server-public-error";
import { readSession } from "@/lib/mercadolibre/session";
import { getOrganizationContext } from "@/lib/organizations/context";
import { loadRotinaView } from "@/lib/rotina/rotina-view-data";

const LOAD_ERROR_MESSAGE =
  "Não foi possível carregar a Central de anúncios agora. Tente de novo em instantes.";

/** Só banco: o cálculo pesado (ML) acontece no botão Atualizar. */
async function RotinaSection({ organizationId }: { organizationId: string }) {
  let view: Awaited<ReturnType<typeof loadRotinaView>>;
  try {
    view = await loadRotinaView(organizationId);
  } catch (e) {
    return (
      <UserFeedback title="Não foi possível carregar a Central de anúncios">
        {publicPageLoadMessage("dashboard/central-anuncios", e, LOAD_ERROR_MESSAGE)}
      </UserFeedback>
    );
  }
  return <RotinaPageClient view={view} />;
}

export const metadata: Metadata = {
  title: "Central de anúncios",
};

export default async function RotinaPage() {
  const cookieStore = await cookies();
  const { accessToken: token, userId } = readSession(cookieStore);
  if (!token || userId === undefined) return null;

  const orgContext = await getOrganizationContext();
  if (orgContext.status !== "active") return null;

  return (
    <Suspense fallback={<RotinaSkeleton />}>
      <RotinaSection organizationId={orgContext.organization.id} />
    </Suspense>
  );
}
