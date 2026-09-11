import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { Kanban } from "lucide-react";
import { OperationsKanban } from "@/components/operacoes-full/OperationsKanban";
import { OperationsKanbanSkeleton } from "@/components/operacoes-full/OperationsKanbanSkeleton";
import { KanbanFullscreenSkeleton } from "@/components/kanban/KanbanFullscreenSkeleton";
import { UserFeedback } from "@/components/ui/user-feedback";
import {
  loadOperationsBoardsFast,
  type OperationsBoardsData,
} from "@/lib/compras/replenishment-cycle-data";
import {
  loadOrMaterializeKanbanBoardSettings,
  loadOrMaterializeKanbanColumns,
  type KanbanBoardSettingsRow,
  type KanbanColumnRow,
} from "@/lib/compras/kanban-columns-data";
import { readSession } from "@/lib/mercadolibre/session";
import { getOrganizationContext } from "@/lib/organizations/context";
import { publicPageLoadMessage } from "@/lib/infra/server-public-error";

const DEFAULT_SETTINGS: KanbanBoardSettingsRow = {
  background: "",
  isFullscreen: false,
};

async function OperacoesFullDataSection({
  boardsPromise,
  columnsPromise,
  background,
  isFullscreen,
}: {
  boardsPromise: Promise<OperationsBoardsData>;
  columnsPromise: Promise<KanbanColumnRow[]>;
  background: string;
  isFullscreen: boolean;
}) {
  let loadError: string | null = null;
  let boards: OperationsBoardsData | null = null;
  let columns: KanbanColumnRow[] = [];

  try {
    [boards, columns] = await Promise.all([boardsPromise, columnsPromise]);
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

  return (
    <OperationsKanban
      initialData={boards}
      kind="full"
      initialColumns={columns}
      initialBackground={background}
      initialFullscreen={isFullscreen}
    />
  );
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

  const organizationId = orgContext.organization.id;
  const boardsPromise = loadOperationsBoardsFast(organizationId, token, "full");
  const columnsPromise = loadOrMaterializeKanbanColumns(organizationId, "full");
  const settingsPromise = loadOrMaterializeKanbanBoardSettings(organizationId, "full");

  let settings = DEFAULT_SETTINGS;
  try {
    settings = await settingsPromise;
  } catch {
    // Chrome cai no layout normal; o fetch pesado dos cards segue em paralelo.
  }

  const board = (
    <Suspense
      fallback={
        settings.isFullscreen ? (
          <KanbanFullscreenSkeleton
            title="Operações Full"
            background={settings.background}
          />
        ) : (
          <OperationsKanbanSkeleton />
        )
      }
    >
      <OperacoesFullDataSection
        boardsPromise={boardsPromise}
        columnsPromise={columnsPromise}
        background={settings.background}
        isFullscreen={settings.isFullscreen}
      />
    </Suspense>
  );

  if (settings.isFullscreen) return board;

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

      {board}
    </div>
  );
}
