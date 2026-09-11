import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { ShoppingCart } from "lucide-react";
import { ComprasPageClient } from "@/components/compras/ComprasPageClient";
import { ComprasPageSkeleton } from "@/components/compras/ComprasPageSkeleton";
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

async function ComprasDataSection({
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
    <ComprasPageClient
      cards={cards}
      initialColumns={columns}
      initialBackground={background}
      initialFullscreen={isFullscreen}
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
  const boardsPromise = loadOperationsBoardsFast(organizationId, token, "purchase");
  const columnsPromise = loadOrMaterializeKanbanColumns(organizationId, "purchase");
  const settingsPromise = loadOrMaterializeKanbanBoardSettings(
    organizationId,
    "purchase",
  );

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
          <KanbanFullscreenSkeleton title="Compras" background={settings.background} />
        ) : (
          <ComprasPageSkeleton />
        )
      }
    >
      <ComprasDataSection
        boardsPromise={boardsPromise}
        columnsPromise={columnsPromise}
        background={settings.background}
        isFullscreen={settings.isFullscreen}
      />
    </Suspense>
  );

  if (settings.isFullscreen) return board;

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

      {board}
    </div>
  );
}
