import type { Metadata } from "next";
import { cache, Suspense } from "react";
import { cookies } from "next/headers";
import Link from "next/link";
import { Award, ExternalLink } from "lucide-react";
import { DashboardOnboardingChecklist } from "@/components/home/DashboardOnboardingChecklist";
import { DashboardOperationsSummary } from "@/components/home/DashboardOperationsSummary";
import { DashboardSellerMetrics } from "@/components/home/DashboardSellerMetrics";
import { DashboardSummaryClient } from "@/components/home/DashboardSummaryClient";
import { UserFeedback } from "@/components/ui/user-feedback";
import { fetchMe } from "@/lib/mercadolibre/api";
import { readSession } from "@/lib/mercadolibre/session";
import { getOrganizationContext } from "@/lib/organizations/context";
import {
  buildSellerReputationBadge,
  type SellerReputationBadge,
} from "@/lib/mercadolibre/seller-reputation";
import { loadOperationsSummaryFromDb } from "@/lib/compras/replenishment-cycle-data";
import { getOnboardingChecklistState } from "@/lib/onboarding/onboarding-checklist";
import { loadPmaAlerts } from "@/lib/home/pma-alert-data";
import { publicPageLoadMessage } from "@/lib/infra/server-public-error";
import { cn } from "@/lib/utils";

async function AttentionSection({
  token,
  organizationId,
}: {
  token: string;
  organizationId: string;
}) {
  const rows = await loadPmaAlerts(token, organizationId).catch(() => []);
  return <DashboardSummaryClient pmaRows={rows} />;
}

function AttentionSkeleton() {
  return <div className="h-24 animate-pulse rounded-3xl bg-[var(--card)]" />;
}

const loadSellerProfile = cache(async (token: string) =>
  fetchMe(token).catch(() => null),
);

const REPUTATION_BADGE_CLASS: Record<SellerReputationBadge["variant"], string> = {
  success: "text-emerald-700",
  warning: "text-amber-700",
  destructive: "text-rose-700",
};

function ReputationMark({ badge }: { badge: SellerReputationBadge }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-sm font-medium",
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
  const nickname = me?.nickname?.trim() || null;

  if (!nickname && !badge && !me?.permalink) {
    return null;
  }

  return (
    <div>
      {nickname ? (
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-[var(--foreground)] sm:text-4xl">
          {nickname}
        </h1>
      ) : null}
      {badge || me?.permalink ? (
        <div
          className={cn(
            "flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-[var(--muted-foreground)]",
            nickname && "mt-1.5",
          )}
        >
          {badge ? <ReputationMark badge={badge} /> : null}
          {me?.permalink ? (
            <Link
              href={me.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-full p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              aria-label="Ver loja no Mercado Livre"
            >
              <ExternalLink className="size-3.5" aria-hidden />
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

async function SellerStats({ token }: { token: string }) {
  const me = await loadSellerProfile(token);
  const transactions = me?.seller_reputation?.transactions;
  const completed = transactions?.completed ?? null;
  const canceled = transactions?.canceled;
  const positiveRatio = transactions?.ratings?.positive;
  const totalTransactions = (completed ?? 0) + (canceled ?? 0);
  const cancelRatio =
    canceled != null && totalTransactions > 0
      ? canceled / totalTransactions
      : null;

  return (
    <DashboardSellerMetrics
      completed={completed}
      satisfactionPercent={
        positiveRatio != null ? Math.round(positiveRatio * 100) : null
      }
      cancelPercent={
        cancelRatio != null ? Math.round(cancelRatio * 100) : null
      }
    />
  );
}

export const metadata: Metadata = {
  title: "Início",
};

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const { accessToken: token, userId } = readSession(cookieStore);

  if (!token || userId === undefined) {
    return null;
  }

  const orgContext = await getOrganizationContext();
  if (orgContext.status !== "active") {
    return null;
  }

  const organizationId = orgContext.organization.id;

  const [onboardingState, operationsResult] = await Promise.all([
    getOnboardingChecklistState(organizationId).catch(() => null),
    loadOperationsSummaryFromDb(organizationId)
      .then((summary) => ({ summary, error: null as string | null }))
      .catch((e) => ({
        summary: null,
        error: publicPageLoadMessage(
          "dashboard/home",
          e,
          "Não foi possível carregar o início agora. Tente de novo em instantes.",
        ),
      })),
  ]);

  if (operationsResult.error) {
    return (
      <UserFeedback title="Não foi possível carregar o início">
        {operationsResult.error}
      </UserFeedback>
    );
  }

  return (
    <div className="space-y-8 sm:space-y-10">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <Suspense fallback={null}>
          <SellerIdentity token={token} />
        </Suspense>
        <Suspense fallback={null}>
          <SellerStats token={token} />
        </Suspense>
      </header>

      {onboardingState ? (
        <DashboardOnboardingChecklist state={onboardingState} />
      ) : null}

      {operationsResult.summary ? (
        <DashboardOperationsSummary summary={operationsResult.summary} />
      ) : null}

      <Suspense fallback={<AttentionSkeleton />}>
        <AttentionSection token={token} organizationId={organizationId} />
      </Suspense>
    </div>
  );
}
