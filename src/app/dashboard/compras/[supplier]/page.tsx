import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { stockPlanningConfig } from "@/config/stock-planning";
import {
  filterRowsBySupplier,
  loadDashboardPurchaseData,
  type PurchaseAnalysisItemRow,
} from "@/lib/compras/dashboard-purchase-data";
import { decodeSupplierParam, supplierPathSegment } from "@/lib/purchase-analysis";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { SupplierPurchaseAnalysisView } from "@/components/compras/supplier-purchase-analysis-view";
import { Card, CardContent } from "@/components/ui/card";
import {
  getSessionAccessState,
  readSession,
  refreshSessionPath,
} from "@/lib/mercadolibre/session";

type PageProps = {
  params: Promise<{ supplier: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { supplier: supplierParam } = await params;
  const supplier = decodeSupplierParam(supplierParam);
  return { title: `${supplier} · Compras` };
}

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
      e instanceof Error ? e.message : "Erro ao carregar análise do fornecedor";
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

  return (
    <div className="space-y-8">
      <div>
        <Breadcrumbs
          items={[
            { label: "Início", href: "/dashboard" },
            { label: "Compras", href: "/dashboard/compras" },
            { label: supplier },
          ]}
        />
        <Link
          href="/dashboard/compras"
          className="mt-3 mb-4 inline-flex items-center gap-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
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

      <SupplierPurchaseAnalysisView
        rows={supplierRows}
        supplierParam={supplierPathSegment(supplier)}
      />
    </div>
  );
}
