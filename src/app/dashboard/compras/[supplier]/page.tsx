import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import {
  filterRowsBySupplier,
  loadDashboardPurchaseData,
} from "@/lib/compras/dashboard-purchase-data";
import { decodeSupplierParam, supplierPathSegment } from "@/lib/compras/purchase-analysis";
import { fetchOperationalListingIds } from "@/lib/mercadolibre/api";
import { resolveMlItemIdsForSupplier } from "@/lib/products/product-resolver";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { SupplierPurchaseAnalysisView } from "@/components/compras/SupplierPurchaseAnalysisView";
import { SupplierPurchaseAnalysisSkeleton } from "@/components/compras/SupplierPurchaseAnalysisSkeleton";
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

async function SupplierPurchaseDataSection({
  token,
  userId,
  organizationId,
  supplier,
  supplierParam,
}: {
  token: string;
  userId: number;
  organizationId: string;
  supplier: string;
  supplierParam: string;
}) {
  let loadError: string | null = null;
  let supplierMissing = false;
  let supplierRows: ReturnType<typeof filterRowsBySupplier> = [];
  let salesAverageWindowDays: number | undefined;

  try {
    // Resolve só os `mlItemId`s deste fornecedor ANTES do sweep pesado de
    // ML (multiget, vendas por item, categorias) — sem isso, essa página
    // computava a análise do catálogo inteiro só pra descartar quase tudo.
    const allIds = await fetchOperationalListingIds(token, userId, organizationId);
    const supplierIds = await resolveMlItemIdsForSupplier(
      organizationId,
      allIds,
      supplier,
    );

    if (supplierIds.length === 0) {
      supplierMissing = true;
    } else {
      const data = await loadDashboardPurchaseData(
        token,
        userId,
        organizationId,
        supplierIds,
      );
      supplierRows = filterRowsBySupplier(data.rows, supplierParam);
      salesAverageWindowDays =
        data.purchaseAnalysisSettings.stockPlanning?.salesAverageWindowDays;
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

  if (loadError) {
    return (
      <UserFeedback title="Não foi possível carregar a análise">
        {loadError}
      </UserFeedback>
    );
  }

  return (
    <div className="space-y-8">
      <p className="max-w-3xl text-[15px] leading-relaxed text-[var(--muted-foreground)]">
        Todos os anúncios ativos deste fornecedor. Projeções usam vendas dos
        últimos {salesAverageWindowDays} dias.
      </p>
      <SupplierPurchaseAnalysisView
        rows={supplierRows}
        supplierParam={supplierParam}
      />
    </div>
  );
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
      </div>

      <Suspense fallback={<SupplierPurchaseAnalysisSkeleton />}>
        <SupplierPurchaseDataSection
          token={token}
          userId={userId}
          organizationId={orgContext.organization.id}
          supplier={supplier}
          supplierParam={supplierPathSegment(supplier)}
        />
      </Suspense>
    </div>
  );
}
