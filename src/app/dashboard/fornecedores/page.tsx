import type { Metadata } from "next";
import { Suspense } from "react";
import { Truck } from "lucide-react";
import { FornecedoresClient } from "@/components/fornecedores/FornecedoresClient";
import { FornecedoresPageSkeleton } from "@/components/fornecedores/FornecedoresPageSkeleton";
import { UserFeedback } from "@/components/ui/user-feedback";
import {
  loadAssignedProducts,
  loadSuppliers,
  loadUnassignedProducts,
} from "@/lib/fornecedores/fornecedores-data";
import { getOrganizationContext } from "@/lib/organizations/context";
import { publicPageLoadMessage } from "@/lib/infra/server-public-error";

async function FornecedoresDataSection({ organizationId }: { organizationId: string }) {
  let data: {
    suppliers: Awaited<ReturnType<typeof loadSuppliers>>;
    unassignedProducts: Awaited<ReturnType<typeof loadUnassignedProducts>>;
    assignedProducts: Awaited<ReturnType<typeof loadAssignedProducts>>;
  } | null = null;
  let loadError: string | null = null;
  try {
    const [suppliers, unassignedProducts, assignedProducts] = await Promise.all([
      loadSuppliers(organizationId),
      loadUnassignedProducts(organizationId),
      loadAssignedProducts(organizationId),
    ]);
    data = { suppliers, unassignedProducts, assignedProducts };
  } catch (e) {
    loadError = publicPageLoadMessage(
      "dashboard/fornecedores",
      e,
      "Não foi possível carregar os fornecedores agora. Tente de novo em instantes.",
    );
  }

  if (loadError || !data) {
    return (
      <UserFeedback title="Não foi possível carregar os fornecedores">
        {loadError ?? "Não foi possível carregar os fornecedores agora. Tente de novo em instantes."}
      </UserFeedback>
    );
  }

  return (
    <FornecedoresClient
      initialSuppliers={data.suppliers}
      initialUnassignedProducts={data.unassignedProducts}
      initialAssignedProducts={data.assignedProducts}
    />
  );
}

export const metadata: Metadata = {
  title: "Fornecedores",
};

export default async function FornecedoresPage() {
  const orgContext = await getOrganizationContext();
  if (orgContext.status !== "active") {
    return null;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary)] sm:size-11">
          <Truck className="size-5" aria-hidden />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">
            Fornecedores
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--muted-foreground)]">
            Cadastre seus fornecedores e arraste os produtos até eles (ou vincule
            pelo cadastro em <span className="font-medium">Meus produtos</span>).
            Produtos sem fornecedor vinculado continuam agrupados pelo texto do
            SKU em Compras e Estoque.
          </p>
        </div>
      </div>
      <Suspense fallback={<FornecedoresPageSkeleton />}>
        <FornecedoresDataSection organizationId={orgContext.organization.id} />
      </Suspense>
    </div>
  );
}
