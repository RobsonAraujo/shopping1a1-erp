import type { Metadata } from "next";
import { cache, Suspense } from "react";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Award, ExternalLink } from "lucide-react";
import { DashboardHomeShortcuts } from "@/components/home/dashboard-home-shortcuts";
import { DashboardOperationsSummary } from "@/components/home/dashboard-operations-summary";
import { DashboardPmaAlertPanel } from "@/components/home/dashboard-pma-alert-panel";
import { DashboardSummaryClient } from "@/components/home/dashboard-summary-client";
import { Card, CardContent } from "@/components/ui/card";
import { fetchMe } from "@/lib/mercadolibre/api";
import {
  getSessionAccessState,
  readSession,
  refreshSessionPath,
} from "@/lib/mercadolibre/session";
import {
  buildSellerReputationBadge,
  type SellerReputationBadge,
} from "@/lib/mercadolibre/seller-reputation";
import { loadOperationsSummaryFromDb } from "@/lib/replenishment-cycle-data";
import { loadPmaAlerts } from "@/lib/home/pma-alert-data";
import { cn } from "@/lib/utils";

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

const loadSellerProfile = cache(async (token: string) =>
  fetchMe(token).catch(() => null),
);

const REPUTATION_BADGE_CLASS: Record<SellerReputationBadge["variant"], string> = {
  success: "border-emerald-300 bg-[var(--card)] text-emerald-800 dark:border-emerald-800 dark:text-emerald-300",
  warning: "border-amber-300 bg-[var(--card)] text-amber-800 dark:border-amber-800 dark:text-amber-300",
  destructive: "border-rose-300 bg-[var(--card)] text-rose-800 dark:border-rose-800 dark:text-rose-300",
};

function ReputationPill({ badge }: { badge: SellerReputationBadge }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold",
        REPUTATION_BADGE_CLASS[badge.variant],
      )}
    >
      <Award className="size-3.5" aria-hidden />
      {badge.label}
    </span>
  );
}

async function SellerIdentity({ token }: { token: string }) {
  const me = await loadSellerProfile(token);
  const badge = buildSellerReputationBadge(me?.seller_reputation);
  const nickname = me?.nickname || null;
  const heading = nickname ?? "Início";
  const initial = nickname ? nickname.trim().charAt(0).toUpperCase() : "?";

  return (
    <div className="mt-1 flex items-center gap-3">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-lg font-semibold text-[var(--primary-foreground)]">
        {initial}
      </span>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--primary)] sm:text-3xl">
            {heading}
          </h1>
          {me?.permalink ? (
            <Link
              href={me.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-full p-1.5 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--primary)]"
              aria-label="Ver loja no Mercado Livre"
            >
              <ExternalLink className="size-4" aria-hidden />
            </Link>
          ) : null}
        </div>
        {badge ? (
          <div className="mt-1.5">
            <ReputationPill badge={badge} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SellerIdentityFallback() {
  return (
    <div className="mt-1 flex items-center gap-3">
      <span className="size-11 shrink-0 rounded-full bg-[var(--muted)]" aria-hidden />
      <h1 className="text-2xl font-bold tracking-tight text-[var(--primary)] sm:text-3xl">
        Início
      </h1>
    </div>
  );
}

function SellerStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-2xl font-bold tabular-nums text-[var(--primary)]">
        {value}
      </div>
      <div className="text-[11px] font-medium tracking-wide text-[var(--muted-foreground)] uppercase">
        {label}
      </div>
    </div>
  );
}

async function SellerStats({ token }: { token: string }) {
  const me = await loadSellerProfile(token);
  const transactions = me?.seller_reputation?.transactions;
  const completed = transactions?.completed;
  const canceled = transactions?.canceled;
  const positiveRatio = transactions?.ratings?.positive;
  const totalTransactions = (completed ?? 0) + (canceled ?? 0);
  const cancelRatio =
    canceled != null && totalTransactions > 0
      ? canceled / totalTransactions
      : null;

  if (completed == null && positiveRatio == null && cancelRatio == null) {
    return null;
  }

  return (
    <div className="flex shrink-0 items-center gap-6 sm:border-l sm:border-[var(--border)] sm:pl-6">
      {completed != null ? (
        <SellerStat
          value={completed.toLocaleString("pt-BR")}
          label="vendas concluídas"
        />
      ) : null}
      {positiveRatio != null ? (
        <SellerStat
          value={`${Math.round(positiveRatio * 100)}%`}
          label="satisfação"
        />
      ) : null}
      {cancelRatio != null ? (
        <SellerStat
          value={`${Math.round(cancelRatio * 100)}%`}
          label="cancelamento"
        />
      ) : null}
    </div>
  );
}

export const metadata: Metadata = {
  title: "Início",
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
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium capitalize text-[var(--muted-foreground)]">
              {todayLabel}
            </p>
            <Suspense fallback={<SellerIdentityFallback />}>
              <SellerIdentity token={token} />
            </Suspense>
            <p className="mt-1.5 max-w-2xl text-sm text-[var(--muted-foreground)]">
              Prioridades do dia, atalhos e alertas
            </p>
          </div>

          <Suspense fallback={null}>
            <SellerStats token={token} />
          </Suspense>
        </div>
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
