import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CatalogLosingStrip } from "@/components/catalog-losing-strip";
import { DashboardHomeShortcuts } from "@/components/dashboard-home-shortcuts";
import { DashboardOperationsSummary } from "@/components/dashboard-operations-summary";
import { DashboardSummaryClient } from "@/components/dashboard-summary-client";
import { Card, CardContent } from "@/components/ui/card";
import { prisma } from "@/lib/db";
import {
  getSessionAccessState,
  readSession,
  refreshSessionPath,
} from "@/lib/mercadolibre/session";
import { loadOperationsSummaryFromDb } from "@/lib/replenishment-cycle-data";

const losingWhere = {
  catalogStatus: "losing" as const,
  activeOnMl: true,
};

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
  let losingCount = 0;
  let sampleTitles: Array<{ mlItemId: string; label: string }> = [];
  let loadError: string | null = null;

  try {
    const [opsSummary, losingSamples, count] = await Promise.all([
      loadOperationsSummaryFromDb(),
      prisma.listing.findMany({
        where: losingWhere,
        select: {
          mlItemId: true,
          skuSnapshot: true,
          titleSnapshot: true,
        },
        orderBy: { catalogPolledAt: "desc" },
        take: 3,
      }),
      prisma.listing.count({ where: losingWhere }),
    ]);

    operationsSummary = opsSummary;
    losingCount = count;
    sampleTitles = losingSamples.map((row) => ({
      mlItemId: row.mlItemId,
      label: row.skuSnapshot ?? row.titleSnapshot ?? row.mlItemId,
    }));
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
  const hour = Number(
    now.toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      hour12: false,
    }),
  );
  const greeting =
    hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  return (
    <div className="space-y-8">
      <header className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-gradient-to-br from-[var(--primary)]/[0.06] via-[var(--card)] to-[var(--card)] px-6 py-7 sm:px-8">
        <div
          className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full bg-[var(--primary)]/[0.06] blur-3xl"
          aria-hidden
        />
        <p className="text-sm font-medium text-[var(--muted-foreground)]">
          {greeting} 👋
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-[var(--primary)] sm:text-4xl">
          Início
        </h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-[var(--muted-foreground)]">
          Prioridades do dia, atalhos e alertas — sem a lista completa de
          anúncios.
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

          <section className="space-y-4">
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
          <CatalogLosingStrip
            losingCount={losingCount}
            sampleTitles={sampleTitles}
          />
          <DashboardHomeShortcuts />
        </aside>
      </div>
    </div>
  );
}
