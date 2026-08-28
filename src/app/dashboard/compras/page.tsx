import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Suspense } from "react";
import {
  buildSupplierSummaries,
  loadDashboardPurchaseData,
} from "@/lib/compras/dashboard-purchase-data";
import { ShoppingCart } from "lucide-react";
import { ComprasPageClient } from "@/components/compras/compras-page-client";
import { ComprasPageSkeleton } from "@/components/compras/compras-page-skeleton";
import { UserFeedback } from "@/components/ui/user-feedback";
import { loadOperationsBoards } from "@/lib/replenishment-cycle-data";
import { readSession } from "@/lib/mercadolibre/session";
import { getOrganizationContext } from "@/lib/organizations/context";
import { publicPageLoadMessage } from "@/lib/server-public-error";

async function ComprasDataSection({
  token,
  userId,
  organizationId,
}: {
  token: string;
  userId: number;
  organizationId: string;
}) {
  let loadError: string | null = null;
  let summaries: ReturnType<typeof buildSupplierSummaries> = [];
  let rows: Awaited<ReturnType<typeof loadDashboardPurchaseData>>["rows"] = [];
  let boards: Awaited<ReturnType<typeof loadOperationsBoards>> | null = null;

  try {
    const [purchaseData, operationsBoards] = await Promise.all([
      loadDashboardPurchaseData(token, userId, organizationId),
      loadOperationsBoards(token, userId, organizationId),
    ]);
    summaries = buildSupplierSummaries(
      purchaseData.rows,
      purchaseData.needsPurchase,
    );
    rows = purchaseData.rows;
    boards = operationsBoards;
  } catch (e) {
    loadError = publicPageLoadMessage(
      "dashboard/compras",
      e,
      "Não foi possível carregar as compras agora. Tente de novo em instantes.",
    );
  }

  if (loadError || !boards) {
    return (
      <UserFeedback title="Não foi possível carregar as compras">
        {loadError ?? "Não foi possível carregar as compras agora. Tente de novo em instantes."}
      </UserFeedback>
    );
  }

  return <ComprasPageClient summaries={summaries} rows={rows} boards={boards} />;
}

export const metadata: Metadata = {
  title: "Compras",
};

export default async function ComprasPage() {
  const cookieStore = await cookies();
  const { accessToken: token, userId } = readSession(cookieStore);

  if (!token || userId === undefined) {
    return null;
  }

  const orgContext = await getOrganizationContext();
  if (orgContext.status !== "active") {
    return null;
  }

  return (
    <div className="space-y-8">
      <header className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-900 shadow-sm">
          <ShoppingCart className="size-6" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-[var(--primary)]">
            Compras
          </h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-[var(--muted-foreground)]">
            Análise por fornecedor e kanban de reposição. Pausados ficam ocultos
            por padrão.
          </p>
        </div>
      </header>

      <Suspense fallback={<ComprasPageSkeleton />}>
        <ComprasDataSection
          token={token}
          userId={userId}
          organizationId={orgContext.organization.id}
        />
      </Suspense>
    </div>
  );
}
