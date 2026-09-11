import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { OperationCycleKind } from "@/generated/prisma/client";
import {
  setKanbanBoardBackground,
  setKanbanBoardFullscreen,
  type KanbanBoardSettingsRow,
} from "@/lib/compras/kanban-columns-data";
import { requireOrganization } from "@/lib/api/api-auth";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { parseJsonBody } from "@/lib/api/api-validation";

const patchBodySchema = z
  .object({
    kind: z.nativeEnum(OperationCycleKind),
    background: z.string().max(200),
    isFullscreen: z.boolean(),
  })
  .partial({ background: true, isFullscreen: true })
  .refine((data) => data.background !== undefined || data.isFullscreen !== undefined, {
    message: "Nada para atualizar",
  });

/** Cor de fundo + preferência de tela cheia do board (Kanban de Compras ou
 * Operações Full) — compartilhadas pela organização, igual a um board no
 * Trello. `GET /api/kanban-columns` já devolve os valores atuais junto com
 * as colunas (mesma tela sempre busca os dois juntos); este endpoint só
 * existe pra escrever. */
export async function PATCH(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { organizationId } = auth.ctx;

  const parsedBody = await parseJsonBody(request, patchBodySchema);
  if (!parsedBody.ok) return parsedBody.response;

  try {
    let settings: KanbanBoardSettingsRow | undefined;
    if (parsedBody.data.background !== undefined) {
      settings = await setKanbanBoardBackground(
        organizationId,
        parsedBody.data.kind,
        parsedBody.data.background,
      );
    }
    if (parsedBody.data.isFullscreen !== undefined) {
      settings = await setKanbanBoardFullscreen(
        organizationId,
        parsedBody.data.kind,
        parsedBody.data.isFullscreen,
      );
    }
    return NextResponse.json(settings);
  } catch (e) {
    logServerError("api/kanban-board-settings PATCH", e);
    return NextResponse.json(apiErrorPayload(e, "kanban_board_settings_update_failed"), {
      status: 502,
    });
  }
}
