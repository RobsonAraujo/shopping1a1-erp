import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { stockPlanningConfig } from "@/config/stock-planning";
import {
  filterRowsBySupplier,
  loadDashboardPurchaseData,
  type PurchaseAnalysisItemRow,
} from "@/lib/dashboard-purchase-data";
import { decodeSupplierParam } from "@/lib/purchase-analysis";
import { SupplierPurchaseAnalysisTable } from "@/components/supplier-purchase-analysis-table";
import { Card, CardContent } from "@/components/ui/card";
import {
  getSessionAccessState,
  readSession,
  refreshSessionPath,
} from "@/lib/mercadolibre/session";

type PageProps = {
  params: Promise<{ supplier: string }>;
};

export default async function SupplierPurchasePage({ params }: PageProps) {
  const { supplier: supplierParam } = await params;
  const supplier = decodeSupplierParam(supplierParam);

  const cookieStore = await cookies();
  const session = getSessionAccessState(cookieStore);
  if (session.needsRefresh) {
    redirect(refreshSessionPath(`/dashboard/compras/${supplierParam}`));
  }
  const token = session.accessToken;
  const { userId } = readSession(cookieStore);

  if (!token || userId === undefined) {
    return null;
  }

  let loadError: string | null = null;
  let supplierRows: PurchaseAnalysisItemRow[] = [];
  let supplierMissing = false;

  try {
    const data = await loadDashboardPurchaseData(token, userId);
    supplierRows = filterRowsBySupplier(data.rows, supplierParam);

    if (supplierRows.length === 0) {
      const hasAnySupplier = data.rows.some((r) => r.supplier === supplier);
      if (!hasAnySupplier) {
        supplierMissing = true;
      }
    }

  } catch (e) {
    loadError =
      e instanceof Error
        ? e.message
        : "Erro ao carregar análise do fornecedor";
  }

  if (supplierMissing) {
    notFound();
  }

  if (loadError) {
    return (
      <Card className="border-red-200 bg-red-50/50">
        <CardContent className="pt-6 text-red-900">{loadError}</CardContent>
      </Card>
    );
  }

  const urgentCount = supplierRows.filter(
    (r) => r.analysis.purchaseStatus === "urgente",
  ).length;
  const highRotationCount = supplierRows.filter(
    (r) => r.analysis.performanceTier === "alta",
  ).length;
  const noSalesCount = supplierRows.filter(
    (r) => r.analysis.performanceTier === "zero",
  ).length;
  const suggestedUnitsTotal = supplierRows
    .filter((r) => r.analysis.recommendation === "comprar")
    .reduce((sum, r) => sum + r.analysis.suggestedQty, 0);

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/dashboard/compras"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Voltar para fornecedores
        </Link>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--primary)]">
          Análise de compra — {supplier}
        </h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-[var(--muted-foreground)]">
          Todos os anúncios ativos deste fornecedor. Projeções usam vendas dos
          últimos {stockPlanningConfig.salesAverageWindowDays} dias.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-[var(--muted-foreground)]">Urgentes</p>
            <p className="text-2xl font-bold tabular-nums text-rose-900">
              {urgentCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-[var(--muted-foreground)]">
              Boa rotação
            </p>
            <p className="text-2xl font-bold tabular-nums">
              {highRotationCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-[var(--muted-foreground)]">Sem vendas</p>
            <p className="text-2xl font-bold tabular-nums">{noSalesCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-[var(--muted-foreground)]">
              Un. sugeridas
            </p>
            <p className="text-2xl font-bold tabular-nums">
              {suggestedUnitsTotal}
            </p>
          </CardContent>
        </Card>
      </div>

      <SupplierPurchaseAnalysisTable rows={supplierRows} />
    </div>
  );
}
