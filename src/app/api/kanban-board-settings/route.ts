import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { OperationCycleKind } from "@/generated/prisma/client";
import {
  setKanbanBoardAppearance,
  setKanbanBoardBackground,
  setKanbanBoardFullscreen,
  type KanbanBoardSettingsRow,
} from "@/lib/compras/kanban-columns-data";
import { normalizeKanbanAppearance } from "@/lib/kanban/kanban-column-colors";
import { requireOrganization } from "@/lib/api/api-auth";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { parseJsonBody } from "@/lib/api/api-validation";

const appearanceSchema = z.object({
  theme: z.enum(["default", "solid", "colorful"]),
  solidColor: z.string().max(32),
  colorMode: z.enum(["stripe", "header", "wash"]),
  columnColors: z
    .record(z.string().max(80), z.string().max(32))
    .refine((value) => Object.keys(value).length <= 40, {
      message: "Muitas cores de coluna",
    }),
});

const patchBodySchema = z
  .object({
    kind: z.nativeEnum(OperationCycleKind),
    background: z.string().max(200),
    isFullscreen: z.boolean(),
    appearance: appearanceSchema,
  })
  .partial({ background: true, isFullscreen: true, appearance: true })
  .refine(
    (data) =>
      data.background !== undefined ||
      data.isFullscreen !== undefined ||
      data.appearance !== undefined,
    {
      message: "Nada para atualizar",
    },
  );

/** Visual do board (fundo, tela cheia, aparência das colunas) — compartilhado
 * pela organização. `GET /api/kanban-columns` já devolve os valores atuais;
 * este endpoint só existe pra escrever. */
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
    if (parsedBody.data.appearance !== undefined) {
      settings = await setKanbanBoardAppearance(
        organizationId,
        parsedBody.data.kind,
        normalizeKanbanAppearance(parsedBody.data.appearance),
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
