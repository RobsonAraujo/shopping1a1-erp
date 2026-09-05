import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { ShoppingCart } from "lucide-react";
import { ComprasPageClient } from "@/components/compras/ComprasPageClient";
import { ComprasPageSkeleton } from "@/components/compras/ComprasPageSkeleton";
import { UserFeedback } from "@/components/ui/user-feedback";
import { loadOperationsBoards } from "@/lib/compras/replenishment-cycle-data";
import { readSession } from "@/lib/mercadolibre/session";
import { getOrganizationContext } from "@/lib/organizations/context";
import { publicPageLoadMessage } from "@/lib/infra/server-public-error";

async function ComprasDataSection({
  token,
  userId,
  organizationId,
}: {
  token: string;
  userId: number;
  organizationId: string;
}) {
  let cards: Awaited<ReturnType<typeof loadOperationsBoards>>["purchase"]["cards"] | null =
    null;
  let loadError: string | null = null;
  try {
    const boards = await loadOperationsBoards(token, userId, organizationId);
    cards = boards.purchase.cards;
  } catch (e) {
    loadError = publicPageLoadMessage(
      "dashboard/compras",
      e,
      "Não foi possível carregar as compras agora. Tente de novo em instantes.",
    );
  }

  if (loadError || !cards) {
    return (
      <UserFeedback title="Não foi possível carregar as compras">
        {loadError ?? "Não foi possível carregar as compras agora. Tente de novo em instantes."}
      </UserFeedback>
    );
  }

  return <ComprasPageClient cards={cards} />;
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
            Kanban de compras agrupado por fornecedor — arraste um card para
            avançar a etapa de compra dos produtos daquele fornecedor.
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
