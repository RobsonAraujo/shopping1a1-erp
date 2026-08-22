import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { Kanban } from "lucide-react";
import { OperationsKanban } from "@/components/operacoes-full/operations-kanban";
import { OperationsKanbanSkeleton } from "@/components/operacoes-full/operations-kanban-skeleton";
import { UserFeedback } from "@/components/ui/user-feedback";
import { loadOperationsBoards } from "@/lib/replenishment-cycle-data";
import { readSession } from "@/lib/mercadolibre/session";
import { getOrganizationContext } from "@/lib/organizations/context";
import { publicPageLoadMessage } from "@/lib/server-public-error";

async function OperacoesFullDataSection({
  token,
  userId,
  organizationId,
}: {
  token: string;
  userId: number;
  organizationId: string;
}) {
  let loadError: string | null = null;
  let boards: Awaited<ReturnType<typeof loadOperationsBoards>> | null = null;

  try {
    boards = await loadOperationsBoards(token, userId, organizationId);
  } catch (e) {
    loadError = publicPageLoadMessage(
      "dashboard/operacoes-full",
      e,
      "Não foi possível carregar as operações Full agora. Tente de novo em instantes.",
    );
  }

  if (loadError || !boards) {
    return (
      <UserFeedback title="Não foi possível carregar as operações Full">
        {loadError ??
          "Não foi possível carregar as operações Full agora. Tente de novo em instantes."}
      </UserFeedback>
    );
  }

  return <OperationsKanban initialData={boards} kind="full" />;
}

export const metadata: Metadata = {
  title: "Operações Full",
};

export default async function OperacoesFullPage() {
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
    <div className="space-y-6">
      <header className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-900 shadow-sm">
          <Kanban className="size-6" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-[var(--primary)]">
            Operações Full
          </h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-[var(--muted-foreground)]">
            Acompanhe o fluxo de envio ao Full: agendamento e coleta. Use
            Avançar ou Mover para… em cada card.
          </p>
        </div>
      </header>

      <Suspense fallback={<OperationsKanbanSkeleton />}>
        <OperacoesFullDataSection
          token={token}
          userId={userId}
          organizationId={orgContext.organization.id}
        />
      </Suspense>
    </div>
  );
}
