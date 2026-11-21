import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { UserFeedback } from "@/components/ui/user-feedback";
import { StockAutoActivation } from "@/components/stock/StockAutoActivation";
import { StockExitButton } from "@/components/stock/StockExitForm";
import { StockPageHeader } from "@/components/stock/StockPageHeader";
import { StockPositionView } from "@/components/stock/StockPositionView";
import { StockSyncBar } from "@/components/stock/StockSyncBar";
import { StockTabsNav } from "@/components/stock/StockTabsNav";
import { publicPageLoadMessage } from "@/lib/infra/server-public-error";
import { getOrganizationContext } from "@/lib/organizations/context";
import {
  loadOpenStockReviews,
  loadStockOverview,
  loadStockSettings,
} from "@/lib/stock/stock-page-data";

export const metadata: Metadata = {
  title: "Estoque",
};

function PositionSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="rounded-2xl p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-7 w-28" />
            <Skeleton className="mt-2 h-3 w-36" />
          </Card>
        ))}
      </div>
      <Card className="rounded-2xl p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="my-3 h-9 w-full" />
        ))}
      </Card>
    </div>
  );
}

async function PositionSection({ organizationId }: { organizationId: string }) {
  let data: [Awaited<ReturnType<typeof loadStockOverview>>, Awaited<ReturnType<typeof loadOpenStockReviews>>];
  try {
    data = await Promise.all([loadStockOverview(organizationId), loadOpenStockReviews(organizationId)]);
  } catch (e) {
    const msg = publicPageLoadMessage(
      "dashboard/inventory",
      e,
      "Não foi possível carregar o estoque agora. Tente de novo em instantes.",
    );
    return <UserFeedback title="Não foi possível carregar o estoque">{msg}</UserFeedback>;
  }
  const [overview, reviews] = data;
  if (!overview) return null;
  const exitItems = overview.rows.map((r) => ({
    stockItemId: r.stockItemId,
    title: r.title,
    sku: r.sku,
    ownQty: r.own,
  }));
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <StockSyncBar {...overview.sync} />
        <div className="flex flex-wrap gap-2">
          <StockExitButton items={exitItems} />
          <Button asChild>
            <Link href="/dashboard/inventory/entradas?nova=1">
              <Plus aria-hidden />
              Registrar entrada
            </Link>
          </Button>
        </div>
      </div>
      <StockPositionView rows={overview.rows} reviews={reviews} />
    </div>
  );
}

export default async function InventoryPage() {
  const orgContext = await getOrganizationContext();
  if (orgContext.status !== "active") return null;
  const organizationId = orgContext.organization.id;

  const settings = await loadStockSettings(organizationId);
  if (!settings) {
    // Primeira visita: ativa sozinho (tela de bloqueio com progresso) e recarrega.
    return (
      <div className="space-y-6">
        <StockPageHeader subtitle="Galpão, depósito e Full de cada produto, atualizados sozinhos a partir das vendas do Mercado Livre." />
        <StockAutoActivation>
          <PositionSkeleton />
        </StockAutoActivation>
      </div>
    );
  }

  const reviews = await loadOpenStockReviews(organizationId);

  return (
    <div className="space-y-6">
      <StockPageHeader subtitle="Galpão, depósito e Full de cada produto. As vendas baixam sozinhas; você registra entradas e envios ao Full." />
      <StockTabsNav active="posicao" pendingCount={reviews.length} />
      <Suspense fallback={<PositionSkeleton />}>
        <PositionSection organizationId={organizationId} />
      </Suspense>
    </div>
  );
}
