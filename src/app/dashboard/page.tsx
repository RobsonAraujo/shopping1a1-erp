import type { Metadata } from "next";
import { cache, Suspense } from "react";
import { cookies } from "next/headers";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { DashboardCatalogLosingPanel } from "@/components/home/DashboardCatalogLosingPanel";
import { DashboardDailyChecklist } from "@/components/home/DashboardDailyChecklist";
import { DashboardFocusTimer } from "@/components/home/DashboardFocusTimer";
import { DashboardOnboardingChecklist } from "@/components/home/DashboardOnboardingChecklist";
import { DashboardQuickNotes } from "@/components/home/DashboardQuickNotes";
import { DashboardOperationsSummary } from "@/components/home/DashboardOperationsSummary";
import { DashboardSalesCard } from "@/components/home/DashboardSalesCard";
import { DashboardSummaryClient } from "@/components/home/DashboardSummaryClient";
import { UserFeedback } from "@/components/ui/user-feedback";
import { fetchMe } from "@/lib/mercadolibre/api";
import { readSession } from "@/lib/mercadolibre/session";
import { getOrganizationContext } from "@/lib/organizations/context";
import { buildSellerReputationBadge } from "@/lib/mercadolibre/seller-reputation";
import { loadOperationsSummaryFromDb } from "@/lib/compras/replenishment-cycle-data";
import { getOnboardingChecklistState } from "@/lib/onboarding/onboarding-checklist";
import { loadCatalogLosingAlerts } from "@/lib/home/catalog-losing-data";
import { buildDashboardSalesSnapshot } from "@/lib/home/sales-card-data";
import { loadPmaAlerts } from "@/lib/home/pma-alert-data";
import { publicPageLoadMessage } from "@/lib/infra/server-public-error";
import { cn } from "@/lib/utils";

async function AttentionSection({
  token,
  organizationId,
  hasCatalogLosing,
}: {
  token: string;
  organizationId: string;
  hasCatalogLosing: boolean;
}) {
  const rows = await loadPmaAlerts(token, organizationId).catch(() => []);
  return (
    <DashboardSummaryClient
      pmaRows={rows}
      hasCatalogLosing={hasCatalogLosing}
    />
  );
}

function SellerIdentitySkeleton() {
  return (
    <div aria-hidden>
      <div className="h-7 w-48 animate-pulse rounded-lg bg-[var(--muted)] sm:h-9 sm:w-64" />
      <div className="mt-1.5 h-4 w-36 animate-pulse rounded bg-[var(--muted)]" />
    </div>
  );
}

function AttentionSkeleton() {
  return <div className="h-24 animate-pulse rounded-3xl bg-[var(--card)]" />;
}

function SalesCardSkeleton() {
  return <DashboardSalesCard pending />;
}

const loadSellerProfile = cache(async (token: string) =>
  fetchMe(token).catch(() => null),
);

async function SalesCardSection({ token }: { token: string }) {
  const me = await loadSellerProfile(token);
  const snapshot = buildDashboardSalesSnapshot(me);
  if (!snapshot) return null;
  return <DashboardSalesCard snapshot={snapshot} />;
}

function sellerCaptionFacts(
  me: Awaited<ReturnType<typeof loadSellerProfile>>,
): string[] {
  const badge = buildSellerReputationBadge(me?.seller_reputation);
  return [badge?.label].filter((fact): fact is string => Boolean(fact));
}

async function SellerIdentity({ token }: { token: string }) {
  const me = await loadSellerProfile(token);
  const nickname = me?.nickname?.trim() || null;
  const permalink = me?.permalink;
  const facts = sellerCaptionFacts(me);

  if (!nickname && facts.length === 0 && !permalink) {
    return null;
  }

  return (
    <div>
      {nickname ? (
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-[var(--foreground)] sm:text-4xl">
          {nickname}
        </h1>
      ) : null}
      {facts.length > 0 || permalink ? (
        <p
          className={cn(
            "flex flex-wrap items-center gap-x-2 text-[15px] text-[var(--muted-foreground)]",
            nickname && "mt-1.5",
          )}
        >
          {facts.length > 0 ? <span>{facts.join(" · ")}</span> : null}
          {permalink ? (
            <Link
              href={permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-full p-1 hover:text-[var(--foreground)]"
              aria-label="Ver loja no Mercado Livre"
            >
              <ExternalLink className="size-3.5" aria-hidden />
            </Link>
          ) : null}
        </p>
      ) : null}
    </div>
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

  const [onboardingState, operationsResult, catalogLosing] = await Promise.all([
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
    loadCatalogLosingAlerts(organizationId).catch(() => []),
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
      <header>
        <Suspense fallback={<SellerIdentitySkeleton />}>
          <SellerIdentity token={token} />
        </Suspense>
      </header>

      {onboardingState ? (
        <DashboardOnboardingChecklist state={onboardingState} />
      ) : null}

      <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-3 sm:gap-4">
        <DashboardDailyChecklist />
        <DashboardQuickNotes />
        <DashboardFocusTimer />
      </div>

      <div
        id="prioridades"
        className="grid scroll-mt-24 grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4"
      >
        <Suspense fallback={<SalesCardSkeleton />}>
          <SalesCardSection token={token} />
        </Suspense>
        {operationsResult.summary ? (
          <DashboardOperationsSummary summary={operationsResult.summary} />
        ) : null}
      </div>

      {catalogLosing.length > 0 ? (
        <DashboardCatalogLosingPanel rows={catalogLosing} />
      ) : null}

      <Suspense fallback={<AttentionSkeleton />}>
        <AttentionSection
          token={token}
          organizationId={organizationId}
          hasCatalogLosing={catalogLosing.length > 0}
        />
      </Suspense>
    </div>
  );
}
