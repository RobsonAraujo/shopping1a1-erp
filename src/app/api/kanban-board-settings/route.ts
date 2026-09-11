import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { OperationCycleKind } from "@/generated/prisma/client";
import { setKanbanBoardBackground } from "@/lib/compras/kanban-columns-data";
import { requireOrganization } from "@/lib/api/api-auth";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { parseJsonBody } from "@/lib/api/api-validation";

const patchBodySchema = z.object({
  kind: z.nativeEnum(OperationCycleKind),
  background: z.string().max(200),
});

/** Cor de fundo do board (Kanban de Compras ou Operações Full) — compartilhada
 * pela organização, igual a um board no Trello. `GET /api/kanban-columns`
 * já devolve o valor atual junto com as colunas (mesma tela sempre busca os
 * dois juntos); este endpoint só existe pra escrever. */
export async function PATCH(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { organizationId } = auth.ctx;

  const parsedBody = await parseJsonBody(request, patchBodySchema);
  if (!parsedBody.ok) return parsedBody.response;

  try {
    const settings = await setKanbanBoardBackground(
      organizationId,
      parsedBody.data.kind,
      parsedBody.data.background,
    );
    return NextResponse.json({ background: settings.background });
  } catch (e) {
    logServerError("api/kanban-board-settings PATCH", e);
    return NextResponse.json(apiErrorPayload(e, "kanban_board_settings_update_failed"), {
      status: 502,
    });
  }
}
