import type { OperationCycleKind } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/db";
import {
  FULL_BOARD_COLUMNS,
  FULL_STATUS_LABELS,
  PURCHASE_BOARD_COLUMNS,
  PURCHASE_STATUS_LABELS,
} from "@/lib/compras/replenishment-cycle";

export type KanbanColumnRow = {
  id: string;
  kind: OperationCycleKind;
  label: string;
  position: number;
  isLocked: boolean;
  isCollapsed: boolean;
};

function defaultColumnsForKind(kind: OperationCycleKind): string[] {
  const statuses = kind === "purchase" ? PURCHASE_BOARD_COLUMNS : FULL_BOARD_COLUMNS;
  const labels = kind === "purchase" ? PURCHASE_STATUS_LABELS : FULL_STATUS_LABELS;
  return statuses.map((status) => labels[status]);
}

function toRow(column: {
  id: string;
  kind: OperationCycleKind;
  label: string;
  position: number;
  isLocked: boolean;
  isCollapsed: boolean;
}): KanbanColumnRow {
  return {
    id: column.id,
    kind: column.kind,
    label: column.label,
    position: column.position,
    isLocked: column.isLocked,
    isCollapsed: column.isCollapsed,
  };
}

/**
 * Cria as colunas default (mesmos nomes/ordem de hoje) pra uma org+kind que
 * ainda não tem nenhuma linha em `KanbanColumn`, e faz todo `ReplenishmentCycle`
 * ativo dessa org+kind apontar pra coluna certa: `status === final do kind` vai
 * pra última coluna (travada), qualquer outro status ativo vai pra primeira
 * (travada) — hoje só existem 2 valores de status realmente distintos por
 * ciclo ativo (ver comentário no schema), então essa correspondência já
 * cobre 100% dos casos existentes sem precisar inspecionar status intermediário.
 */
async function materializeDefaultColumns(
  organizationId: string,
  kind: OperationCycleKind,
): Promise<KanbanColumnRow[]> {
  const labels = defaultColumnsForKind(kind);

  return prisma.$transaction(async (tx) => {
    // Corrida entre 2 requests concorrentes materializando a mesma org+kind
    // pela primeira vez: quem chegar segundo encontra as linhas já criadas.
    const existing = await tx.kanbanColumn.findMany({
      where: { organizationId, kind },
      orderBy: { position: "asc" },
    });
    if (existing.length > 0) return existing.map(toRow);

    const created = await Promise.all(
      labels.map((label, index) =>
        tx.kanbanColumn.create({
          data: {
            organizationId,
            kind,
            label,
            position: index,
            isLocked: index === 0 || index === labels.length - 1,
          },
        }),
      ),
    );
    const firstColumnId = created[0].id;
    const lastColumnId = created[created.length - 1].id;
    const finalStatus = kind === "purchase" ? "ordered" : "collected";

    await tx.replenishmentCycle.updateMany({
      where: { organizationId, kind, status: finalStatus },
      data: { columnId: lastColumnId },
    });
    await tx.replenishmentCycle.updateMany({
      where: {
        organizationId,
        kind,
        status: { notIn: [finalStatus, "completed"] },
      },
      data: { columnId: firstColumnId },
    });

    return created.map(toRow);
  });
}

/** Colunas da org+kind, ordenadas por posição — materializa os defaults na
 * primeira leitura (mesmo padrão de "ensure" lazy já usado no projeto, ex.
 * `ensureCompanySettings`). */
export async function loadOrMaterializeKanbanColumns(
  organizationId: string,
  kind: OperationCycleKind,
): Promise<KanbanColumnRow[]> {
  const existing = await prisma.kanbanColumn.findMany({
    where: { organizationId, kind },
    orderBy: { position: "asc" },
  });
  if (existing.length > 0) return existing.map(toRow);
  return materializeDefaultColumns(organizationId, kind);
}

export function firstColumn(columns: KanbanColumnRow[]): KanbanColumnRow | undefined {
  return columns[0];
}

export function lastColumn(columns: KanbanColumnRow[]): KanbanColumnRow | undefined {
  return columns[columns.length - 1];
}

export async function createKanbanColumn(
  organizationId: string,
  kind: OperationCycleKind,
  label: string,
): Promise<KanbanColumnRow> {
  const columns = await loadOrMaterializeKanbanColumns(organizationId, kind);
  // Nova coluna entra sempre logo antes da última (travada) — nunca depois.
  const insertPosition = Math.max(columns.length - 1, 1);

  return prisma.$transaction(async (tx) => {
    await tx.kanbanColumn.updateMany({
      where: { organizationId, kind, position: { gte: insertPosition } },
      data: { position: { increment: 1 } },
    });
    const created = await tx.kanbanColumn.create({
      data: { organizationId, kind, label, position: insertPosition, isLocked: false },
    });
    return toRow(created);
  });
}

export async function renameKanbanColumn(
  organizationId: string,
  id: string,
  label: string,
): Promise<KanbanColumnRow> {
  const updated = await prisma.kanbanColumn.update({
    where: { id, organizationId },
    data: { label },
  });
  return toRow(updated);
}

/** Preferência compartilhada da organização (colapsar/expandir), persistida
 * aqui em vez de localStorage — o servidor já manda o estado certo no
 * primeiro paint, sem o "piscar" de esperar o client ler o valor depois de
 * montar. */
export async function setKanbanColumnCollapsed(
  organizationId: string,
  id: string,
  isCollapsed: boolean,
): Promise<KanbanColumnRow> {
  const updated = await prisma.kanbanColumn.update({
    where: { id, organizationId },
    data: { isCollapsed },
  });
  return toRow(updated);
}

/** Reescreve a posição de todas as colunas do kind numa transação — chamado
 * ao soltar o drag de reordenar. `orderedIds` precisa conter exatamente as
 * colunas já existentes desse org+kind (validado pelo caller). */
export async function reorderKanbanColumns(
  organizationId: string,
  kind: OperationCycleKind,
  orderedIds: string[],
): Promise<KanbanColumnRow[]> {
  return prisma.$transaction(async (tx) => {
    await Promise.all(
      orderedIds.map((id, index) =>
        tx.kanbanColumn.update({
          where: { id, organizationId, kind },
          data: { position: index },
        }),
      ),
    );
    const rows = await tx.kanbanColumn.findMany({
      where: { organizationId, kind },
      orderBy: { position: "asc" },
    });
    return rows.map(toRow);
  });
}

export type DeleteKanbanColumnResult =
  | { ok: true }
  | { ok: false; error: "locked" | "not_found" | "needs_destination" | "invalid_destination" };

/** Exclui uma coluna não travada. Se tiver cards, exige `moveCardsToColumnId`
 * (outra coluna do mesmo org+kind) e move todo `ReplenishmentCycle` que
 * apontava pra ela antes de excluir — numa transação, pra nunca deixar um
 * ciclo "órfão" mesmo que a exclusão falhe no meio. */
export async function deleteKanbanColumn(
  organizationId: string,
  id: string,
  moveCardsToColumnId?: string,
): Promise<DeleteKanbanColumnResult> {
  const column = await prisma.kanbanColumn.findFirst({ where: { id, organizationId } });
  if (!column) return { ok: false, error: "not_found" };
  if (column.isLocked) return { ok: false, error: "locked" };

  const cardCount = await prisma.replenishmentCycle.count({
    where: { organizationId, columnId: id, status: { not: "completed" } },
  });

  if (cardCount > 0) {
    if (!moveCardsToColumnId) return { ok: false, error: "needs_destination" };
    const destination = await prisma.kanbanColumn.findFirst({
      where: { id: moveCardsToColumnId, organizationId, kind: column.kind },
    });
    if (!destination || destination.id === id) {
      return { ok: false, error: "invalid_destination" };
    }
  }

  await prisma.$transaction(async (tx) => {
    if (cardCount > 0 && moveCardsToColumnId) {
      await tx.replenishmentCycle.updateMany({
        where: { organizationId, columnId: id },
        data: { columnId: moveCardsToColumnId },
      });
    }
    await tx.kanbanColumn.delete({ where: { id, organizationId } });
    // Fecha o buraco na sequência de posições, senão "criar coluna" (que
    // insere em `columns.length - 1`) pode colidir com uma posição livre.
    await tx.kanbanColumn.updateMany({
      where: { organizationId, kind: column.kind, position: { gt: column.position } },
      data: { position: { decrement: 1 } },
    });
  });

  return { ok: true };
}

export type KanbanBoardSettingsRow = {
  background: string;
  isFullscreen: boolean;
};

const BOARD_SETTINGS_SELECT = { background: true, isFullscreen: true } as const;

/** Cor de fundo + preferência de tela cheia do board (Kanban de Compras ou
 * Operações Full), compartilhadas pela organização — igual à cor de um board
 * no Trello, qualquer pessoa da organização vê o mesmo. Materializa uma
 * linha default ("" = sem cor, tela cheia desligada) na primeira leitura,
 * mesmo padrão de `loadOrMaterializeKanbanColumns`. */
export async function loadOrMaterializeKanbanBoardSettings(
  organizationId: string,
  kind: OperationCycleKind,
): Promise<KanbanBoardSettingsRow> {
  const existing = await prisma.kanbanBoardSettings.findUnique({
    where: { organizationId_kind: { organizationId, kind } },
    select: BOARD_SETTINGS_SELECT,
  });
  if (existing) return existing;

  const created = await prisma.kanbanBoardSettings.upsert({
    where: { organizationId_kind: { organizationId, kind } },
    create: { organizationId, kind },
    update: {},
    select: BOARD_SETTINGS_SELECT,
  });
  return created;
}

export async function setKanbanBoardBackground(
  organizationId: string,
  kind: OperationCycleKind,
  background: string,
): Promise<KanbanBoardSettingsRow> {
  const updated = await prisma.kanbanBoardSettings.upsert({
    where: { organizationId_kind: { organizationId, kind } },
    create: { organizationId, kind, background },
    update: { background },
    select: BOARD_SETTINGS_SELECT,
  });
  return updated;
}

export async function setKanbanBoardFullscreen(
  organizationId: string,
  kind: OperationCycleKind,
  isFullscreen: boolean,
): Promise<KanbanBoardSettingsRow> {
  const updated = await prisma.kanbanBoardSettings.upsert({
    where: { organizationId_kind: { organizationId, kind } },
    create: { organizationId, kind, isFullscreen },
    update: { isFullscreen },
    select: BOARD_SETTINGS_SELECT,
  });
  return updated;
}
