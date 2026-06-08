import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  buildSupplierSummaries,
  loadDashboardPurchaseData,
  type PurchaseAnalysisItemRow,
} from "@/lib/dashboard-purchase-data";
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
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--primary)]">
          Compras por fornecedor
        </h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-[var(--muted-foreground)]">
          Analise todos os produtos de cada fornecedor, veja rotação de vendas,
          quantidade sugerida e se ainda compensa repor estoque.
        </p>
      </div>

      {summaries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-[var(--muted-foreground)]">
            Nenhum anúncio ativo encontrado.
          </CardContent>
        </Card>
      ) : (
        <ComprasSupplierGrid summaries={summaries} rows={rows} />
      )}
    </div>
  );
}
