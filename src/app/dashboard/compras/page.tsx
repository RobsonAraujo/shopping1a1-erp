import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  buildSupplierSummaries,
  loadDashboardPurchaseData,
  type PurchaseAnalysisItemRow,
} from "@/lib/dashboard-purchase-data";
import { ShoppingCart } from "lucide-react";
import { ComprasSupplierGrid } from "@/components/compras-supplier-grid";
import { Card, CardContent } from "@/components/ui/card";
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

  try {
    const data = await loadDashboardPurchaseData(token, userId);
    summaries = buildSupplierSummaries(data.rows, data.needsPurchase);
    rows = data.rows;
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Erro ao carregar compras";
  }

  if (loadError) {
    return (
      <Card className="border-red-200 bg-red-50/50">
        <CardContent className="pt-6 text-red-900">{loadError}</CardContent>
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
            Compras por fornecedor
          </h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-[var(--muted-foreground)]">
            Visão geral por fornecedor: rotação, quantidade sugerida e alertas
            de reposição. Inclui anúncios pausados no ML (ex.: sem estoque).
            Clique em um fornecedor para ver a análise completa.
          </p>
        </div>
      </header>

      {summaries.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--muted)] text-[var(--muted-foreground)]">
              <ShoppingCart className="size-6" aria-hidden />
            </span>
            <div>
              <p className="font-medium text-[var(--foreground)]">
                Nenhum anúncio encontrado
              </p>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                Quando houver produtos ativos ou pausados no Mercado Livre, os
                fornecedores aparecerão aqui.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <ComprasSupplierGrid summaries={summaries} rows={rows} />
      )}
    </div>
  );
}
