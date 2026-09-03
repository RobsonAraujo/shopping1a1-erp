import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { Card, CardContent } from "@/components/ui/card";
import { readSession } from "@/lib/mercadolibre/session";
import { getOrganizationContext } from "@/lib/organizations/context";
import { loadRevenuePotentialData } from "@/lib/insights/revenue-potential";
import { RevenuePotentialView } from "@/components/insights/RevenuePotentialView";
import { RevenuePotentialSkeleton } from "@/components/insights/RevenuePotentialSkeleton";

async function RevenuePotentialSection({
  token,
  userId,
  organizationId,
}: {
  token: string;
  userId: number;
  organizationId: string;
}) {
  const data = await loadRevenuePotentialData(token, userId, organizationId).catch(
    () => null,
  );

  if (!data) {
    return (
      <Card className="border-yellow-200 bg-yellow-50/50">
        <CardContent className="pt-6 text-sm text-yellow-900">
          Não foi possível carregar os dados. Verifique sua conexão com o
          Mercado Livre.
        </CardContent>
      </Card>
    );
  }

  return <RevenuePotentialView rows={data.rows} />;
}

export const metadata: Metadata = {
  title: "Potencial de faturamento",
};

export default async function PotencialFaturamentoPage() {
  const cookieStore = await cookies();
  const { accessToken: token, userId } = readSession(cookieStore);

  if (!token || userId === undefined) return null;

  const orgContext = await getOrganizationContext();
  if (orgContext.status !== "active") return null;

  return (
    <div className="space-y-8">
      <header className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-6 py-7 sm:px-8">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--primary)] sm:text-3xl">
          Potencial de faturamento
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-[var(--muted-foreground)]">
          Estimativa de quanto o catálogo poderia faturar por mês sem ruptura de
          estoque, incluindo produtos pausados.
        </p>
        <p className="mt-1 max-w-2xl text-xs text-[var(--muted-foreground)]">
          A média diária usa as vendas reais de cada produto, ancoradas no
          período em torno da última venda registrada — evita diluir a
          estimativa com dias recentes de ruptura ou pausa.
        </p>
      </header>

      <Suspense fallback={<RevenuePotentialSkeleton />}>
        <RevenuePotentialSection
          token={token}
          userId={userId}
          organizationId={orgContext.organization.id}
        />
      </Suspense>
    </div>
  );
}
