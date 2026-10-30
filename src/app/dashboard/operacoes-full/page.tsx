import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { OperationsKanban } from "@/components/operacoes-full/OperationsKanban";
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
import { DEFAULT_KANBAN_APPEARANCE } from "@/lib/kanban/kanban-column-colors";

const DEFAULT_SETTINGS: KanbanBoardSettingsRow = {
  background: "",
  appearance: DEFAULT_KANBAN_APPEARANCE,
};

async function OperacoesFullDataSection({
  boardsPromise,
  columnsPromise,
  background,
  appearance,
}: {
  boardsPromise: Promise<OperationsBoardsData>;
  columnsPromise: Promise<KanbanColumnRow[]>;
  background: string;
  appearance: KanbanBoardSettingsRow["appearance"];
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
      initialCards={boards.full.cards}
      kind="full"
      initialColumns={columns}
      initialBackground={background}
      initialAppearance={appearance}
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
  const columnsPromise = loadOrMaterializeKanbanColumns(organizationId, "full");
  const boardsPromise = loadOperationsBoardsFast(organizationId, token, "full", columnsPromise);
  const settingsPromise = loadOrMaterializeKanbanBoardSettings(organizationId, "full");

  let settings = DEFAULT_SETTINGS;
  try {
    settings = await settingsPromise;
  } catch {
    // Cai no fundo padrão; o fetch pesado dos cards segue em paralelo.
  }

  return (
    <Suspense
      fallback={
        <KanbanFullscreenSkeleton title="Operações Full" background={settings.background} />
      }
    >
      <OperacoesFullDataSection
        boardsPromise={boardsPromise}
        columnsPromise={columnsPromise}
        background={settings.background}
        appearance={settings.appearance}
      />
    </Suspense>
  );
}
