import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { OperationCycleKind } from "@/generated/prisma/client";
import {
  loadOrMaterializeKanbanColumns,
  reorderKanbanColumns,
} from "@/lib/compras/kanban-columns-data";
import { requireOrganization } from "@/lib/api/api-auth";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { parseJsonBody } from "@/lib/api/api-validation";

const bodySchema = z.object({
  kind: z.nativeEnum(OperationCycleKind),
  orderedIds: z.array(z.string().trim().min(1)).min(1),
});

/** Reescreve a posição de todas as colunas do kind — chamado ao soltar o
 * drag de reordenar cabeçalhos de coluna. A primeira e a última posição do
 * array recebido precisam continuar sendo as colunas travadas (a UI nunca
 * deixa soltar fora dessa faixa, mas o backend confere de novo aqui). */
export async function PATCH(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { organizationId } = auth.ctx;

  const parsedBody = await parseJsonBody(request, bodySchema);
  if (!parsedBody.ok) return parsedBody.response;
  const { kind, orderedIds } = parsedBody.data;

  try {
    const current = await loadOrMaterializeKanbanColumns(organizationId, kind);
    const currentIds = new Set(current.map((c) => c.id));
    const requestedIds = new Set(orderedIds);
    if (
      orderedIds.length !== current.length ||
      currentIds.size !== requestedIds.size ||
      ![...currentIds].every((id) => requestedIds.has(id))
    ) {
      return NextResponse.json(
        { error: "A lista de colunas não bate com as colunas existentes" },
        { status: 400 },
      );
    }

    const firstLocked = current.find((c) => c.isLocked && c.position === 0);
    const lastLocked = current.find(
      (c) => c.isLocked && c.position === current.length - 1,
    );
    if (
      (firstLocked && orderedIds[0] !== firstLocked.id) ||
      (lastLocked && orderedIds[orderedIds.length - 1] !== lastLocked.id)
    ) {
      return NextResponse.json(
        { error: "A primeira e a última coluna não podem mudar de posição" },
        { status: 400 },
      );
    }

    const columns = await reorderKanbanColumns(organizationId, kind, orderedIds);
    return NextResponse.json({ columns });
  } catch (e) {
    logServerError("api/kanban-columns/reorder PATCH", e);
    return NextResponse.json(apiErrorPayload(e, "kanban_columns_reorder_failed"), {
      status: 502,
    });
  }
}
