import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { AlertTriangle, TrendingUp } from "lucide-react";
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
      <Card className="overflow-hidden rounded-2xl border-amber-500/20 bg-amber-500/5 p-0">
        <CardContent className="flex items-start gap-3 p-4 pt-4 text-sm text-amber-900 sm:p-5 sm:pt-5 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <span>
            Não foi possível carregar os dados. Verifique sua conexão com o
            Mercado Livre.
          </span>
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
      <header className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-6 py-7 sm:px-8">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary)]">
          <TrendingUp className="size-5" aria-hidden />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">
            Potencial de faturamento
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--muted-foreground)]">
            Estimativa de quanto o catálogo poderia faturar por mês sem ruptura de
            estoque, incluindo produtos pausados.
          </p>
          <p className="mt-1 max-w-2xl text-xs text-[var(--muted-foreground)]">
            A média diária usa as vendas reais de cada produto, ancoradas no
            período em torno da última venda registrada — evita diluir a
            estimativa com dias recentes de ruptura ou pausa.
          </p>
        </div>
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
