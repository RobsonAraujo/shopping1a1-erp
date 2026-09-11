import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteKanbanColumn,
  renameKanbanColumn,
  setKanbanColumnCollapsed,
} from "@/lib/compras/kanban-columns-data";
import { requireOrganization } from "@/lib/api/api-auth";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { parseJsonBody } from "@/lib/api/api-validation";
import { Prisma } from "@/generated/prisma/client";

type RouteContext = { params: Promise<{ id: string }> };

const patchBodySchema = z
  .object({
    label: z.string().trim().min(1, "Informe o nome da coluna").max(60),
    isCollapsed: z.boolean(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Nada para atualizar",
  });

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { organizationId } = auth.ctx;
  const { id } = await context.params;

  const parsedBody = await parseJsonBody(request, patchBodySchema);
  if (!parsedBody.ok) return parsedBody.response;

  try {
    let column = null;
    if (parsedBody.data.label !== undefined) {
      column = await renameKanbanColumn(organizationId, id, parsedBody.data.label);
    }
    if (parsedBody.data.isCollapsed !== undefined) {
      column = await setKanbanColumnCollapsed(organizationId, id, parsedBody.data.isCollapsed);
    }
    return NextResponse.json({ column });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "Coluna não encontrada" }, { status: 404 });
    }
    logServerError("api/kanban-columns/[id] PATCH", e);
    return NextResponse.json(apiErrorPayload(e, "kanban_column_update_failed"), {
      status: 502,
    });
  }
}

const deleteBodySchema = z
  .object({ moveCardsToColumnId: z.string().trim().min(1).optional() })
  .optional();

const DELETE_ERROR_MESSAGES: Record<string, string> = {
  locked: "Essa coluna não pode ser excluída — só renomeada.",
  not_found: "Coluna não encontrada.",
  needs_destination:
    "Essa coluna tem cards. Escolha para qual outra coluna movê-los antes de excluir.",
  invalid_destination: "Coluna de destino inválida.",
};

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { organizationId } = auth.ctx;
  const { id } = await context.params;

  const parsedBody = await parseJsonBody(request, deleteBodySchema);
  if (!parsedBody.ok) return parsedBody.response;

  try {
    const result = await deleteKanbanColumn(
      organizationId,
      id,
      parsedBody.data?.moveCardsToColumnId,
    );
    if (!result.ok) {
      return NextResponse.json(
        { error: DELETE_ERROR_MESSAGES[result.error], code: result.error },
        { status: result.error === "not_found" ? 404 : 400 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    logServerError("api/kanban-columns/[id] DELETE", e);
    return NextResponse.json(apiErrorPayload(e, "kanban_column_delete_failed"), {
      status: 502,
    });
  }
}
