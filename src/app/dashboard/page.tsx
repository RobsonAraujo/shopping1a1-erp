import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardHomeShortcuts } from "@/components/dashboard-home-shortcuts";
import { DashboardOperationsSummary } from "@/components/dashboard-operations-summary";
import { DashboardPmaAlertPanel } from "@/components/dashboard-pma-alert-panel";
import { DashboardSummaryClient } from "@/components/dashboard-summary-client";
import { Card, CardContent } from "@/components/ui/card";
import {
  getSessionAccessState,
  readSession,
  refreshSessionPath,
} from "@/lib/mercadolibre/session";
import { loadOperationsSummaryFromDb } from "@/lib/replenishment-cycle-data";
import { loadPmaAlerts } from "@/lib/pma-alert-data";

async function PmaAlertSection({
  token,
  userId,
}: {
  token: string;
  userId: number;
}) {
  const rows = await loadPmaAlerts(token, userId).catch(() => []);
  return <DashboardPmaAlertPanel rows={rows} />;
}

function PmaAlertSkeleton() {
  return (
    <div className="h-24 animate-pulse rounded-2xl border border-[var(--border)] bg-[var(--muted)]/30" />
  );
}

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const session = getSessionAccessState(cookieStore);
  if (session.needsRefresh) {
    redirect(refreshSessionPath("/dashboard"));
  }
  const token = session.accessToken;
  const { userId } = readSession(cookieStore);

  if (!token || userId === undefined) {
    return null;
  }

  let operationsSummary: Awaited<
    ReturnType<typeof loadOperationsSummaryFromDb>
  > | null = null;
  let loadError: string | null = null;

  try {
    operationsSummary = await loadOperationsSummaryFromDb();
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Erro ao carregar início";
  }

  if (loadError) {
    return (
      <Card className="border-red-200 bg-red-50/50">
        <CardContent className="pt-6 text-red-900">{loadError}</CardContent>
      </Card>
    );
  }

  const now = new Date();
  const todayLabel = now.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

  return (
    <div className="space-y-8">
      <header className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-6 py-7 sm:px-8">
        <p className="text-sm font-medium capitalize text-[var(--muted-foreground)]">
          {todayLabel}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--primary)] sm:text-3xl">
          Início
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-[var(--muted-foreground)]">
          Prioridades do dia, atalhos e alertas
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="min-w-0 space-y-8">
          {operationsSummary ? (
            <DashboardOperationsSummary summary={operationsSummary} />
          ) : (
            <Card className="border-amber-200 bg-amber-50/50">
              <CardContent className="pt-6 text-sm text-amber-950">
                Não foi possível carregar o resumo de operações. Atualize a
                página ou tente de novo em instantes.
              </CardContent>
            </Card>
          )}

          <Suspense fallback={<PmaAlertSkeleton />}>
            <PmaAlertSection token={token} userId={userId} />
          </Suspense>

          <section className="space-y-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-[var(--primary)]">
                Promoções
              </h2>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                Anúncios próprios ativos — sem desconto ou com promoção
                terminando em breve.
              </p>
            </div>
            <DashboardSummaryClient />
          </section>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-6">
          <DashboardHomeShortcuts />
        </aside>
      </div>
    </div>
  );
}
