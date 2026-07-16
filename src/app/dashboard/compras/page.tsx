import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import {
  buildSupplierSummaries,
  loadDashboardPurchaseData,
  type PurchaseAnalysisItemRow,
} from "@/lib/dashboard-purchase-data";
import { ShoppingCart } from "lucide-react";
import { ComprasPageClient } from "@/components/compras-page-client";
import { Card, CardContent } from "@/components/ui/card";
import { loadOperationsBoards } from "@/lib/replenishment-cycle-data";
import {
  getSessionAccessState,
  readSession,
  refreshSessionPath,
} from "@/lib/mercadolibre/session";

export default async function ComprasPage() {
  const cookieStore = await cookies();
  const session = getSessionAccessState(cookieStore);
  if (session.needsRefresh) {
    redirect(refreshSessionPath("/dashboard/compras"));
  }
  const token = session.accessToken;
  const { userId } = readSession(cookieStore);

  if (!token || userId === undefined) {
    return null;
  }

  let loadError: string | null = null;
  let summaries: ReturnType<typeof buildSupplierSummaries> = [];
  let rows: PurchaseAnalysisItemRow[] = [];
  let boards: Awaited<ReturnType<typeof loadOperationsBoards>> | null = null;

  try {
    const [purchaseData, operationsBoards] = await Promise.all([
      loadDashboardPurchaseData(token, userId),
      loadOperationsBoards(token, userId),
    ]);
    summaries = buildSupplierSummaries(
      purchaseData.rows,
      purchaseData.needsPurchase,
    );
    rows = purchaseData.rows;
    boards = operationsBoards;
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Erro ao carregar compras";
  }

  if (loadError || !boards) {
    return (
      <Card className="border-red-200 bg-red-50/50">
        <CardContent className="pt-6 text-red-900">
          {loadError ?? "Erro ao carregar compras"}
        </CardContent>
      </Card>
    );
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

      <Suspense
        fallback={
          <p className="text-sm text-[var(--muted-foreground)]">Carregando…</p>
        }
      >
        <ComprasPageClient
          summaries={summaries}
          rows={rows}
          boards={boards}
        />
      </Suspense>
    </div>
  );
}
