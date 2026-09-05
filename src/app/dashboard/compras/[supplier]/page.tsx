import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  filterRowsBySupplier,
  loadDashboardPurchaseData,
  type PurchaseAnalysisItemRow,
} from "@/lib/compras/dashboard-purchase-data";
import type { PurchaseAnalysisSettings } from "@/lib/compras/purchase-analysis";
import { decodeSupplierParam, supplierPathSegment } from "@/lib/compras/purchase-analysis";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { SupplierPurchaseAnalysisView } from "@/components/compras/SupplierPurchaseAnalysisView";
import { UserFeedback } from "@/components/ui/user-feedback";
import { readSession } from "@/lib/mercadolibre/session";
import { getOrganizationContext } from "@/lib/organizations/context";
import { publicPageLoadMessage } from "@/lib/infra/server-public-error";

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
  const { accessToken: token, userId } = readSession(cookieStore);

  if (!token || userId === undefined) {
    return null;
  }

  const orgContext = await getOrganizationContext();
  if (orgContext.status !== "active") {
    return null;
  }

  let loadError: string | null = null;
  let supplierRows: PurchaseAnalysisItemRow[] = [];
  let purchaseAnalysisSettings: PurchaseAnalysisSettings | null = null;
  let supplierMissing = false;
  try {
    const data = await loadDashboardPurchaseData(
      token,
      userId,
      orgContext.organization.id,
    );
    supplierRows = filterRowsBySupplier(data.rows, supplierParam);
    purchaseAnalysisSettings = data.purchaseAnalysisSettings;

    if (supplierRows.length === 0) {
      const hasAnySupplier = data.rows.some((r) => r.supplier === supplier);
      if (!hasAnySupplier) {
        supplierMissing = true;
      }
    }
  } catch (e) {
    loadError = publicPageLoadMessage(
      "dashboard/compras/[supplier]",
      e,
      "Não foi possível carregar a análise deste fornecedor. Tente de novo em instantes.",
    );
  }

  if (supplierMissing) {
    notFound();
  }

  if (loadError || !purchaseAnalysisSettings) {
    return (
      <UserFeedback title="Não foi possível carregar a análise">
        {loadError ??
          "Não foi possível carregar a análise deste fornecedor. Tente de novo em instantes."}
      </UserFeedback>
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
          Voltar para o Kanban de compras
        </Link>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--primary)]">
          Análise de compra — {supplier}
        </h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-[var(--muted-foreground)]">
          Todos os anúncios ativos deste fornecedor. Projeções usam vendas dos
          últimos{" "}
          {purchaseAnalysisSettings.stockPlanning?.salesAverageWindowDays}{" "}
          dias.
        </p>
      </div>

      <SupplierPurchaseAnalysisView
        rows={supplierRows}
        supplierParam={supplierPathSegment(supplier)}
      />
    </div>
  );
}
