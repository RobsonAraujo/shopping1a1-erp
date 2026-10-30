import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { SupplierPurchaseKanban } from "@/components/compras/SupplierPurchaseKanban";
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

async function ComprasDataSection({
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
  let cards: OperationsBoardsData["purchase"]["cards"] | null = null;
  let columns: KanbanColumnRow[] = [];
  let loadError: string | null = null;
  try {
    const [boards, columnsResult] = await Promise.all([
      boardsPromise,
      columnsPromise,
    ]);
    cards = boards.purchase.cards;
    columns = columnsResult;
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

  return (
    <SupplierPurchaseKanban
      initialCards={cards}
      initialColumns={columns}
      initialBackground={background}
      initialAppearance={appearance}
    />
  );
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

  const organizationId = orgContext.organization.id;
  const columnsPromise = loadOrMaterializeKanbanColumns(organizationId, "purchase");
  const boardsPromise = loadOperationsBoardsFast(organizationId, token, "purchase", columnsPromise);
  const settingsPromise = loadOrMaterializeKanbanBoardSettings(
    organizationId,
    "purchase",
  );

  let settings = DEFAULT_SETTINGS;
  try {
    settings = await settingsPromise;
  } catch {
    // Cai no fundo padrão; o fetch pesado dos cards segue em paralelo.
  }

  return (
    <Suspense
      fallback={<KanbanFullscreenSkeleton title="Compras" background={settings.background} />}
    >
      <ComprasDataSection
        boardsPromise={boardsPromise}
        columnsPromise={columnsPromise}
        background={settings.background}
        appearance={settings.appearance}
      />
    </Suspense>
  );
}
