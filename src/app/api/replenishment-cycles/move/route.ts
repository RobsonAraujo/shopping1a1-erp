import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { moveReplenishmentCycles } from "@/lib/compras/replenishment-cycle-data";
import { requireOrganization } from "@/lib/api/api-auth";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { parseJsonBody } from "@/lib/api/api-validation";

const bodySchema = z.object({
  cycleIds: z.array(z.string().trim().min(1)).min(1).max(200),
  columnId: z.string().trim().min(1),
  // Zod 4 já recusa NaN/Infinity em `z.number()`.
  position: z.number(),
});

const ERROR_RESPONSES = {
  not_found: { status: 404, error: "Nenhum ciclo ativo encontrado" },
  mixed_kinds: { status: 400, error: "Todos os ciclos devem ser do mesmo board" },
  invalid_column: { status: 400, error: "Coluna inválida para esse board" },
} as const;

/**
 * Drag-and-drop dos Kanbans (Compras e Operações Full): põe os ciclos na
 * coluna e na posição pedidas. Leve de propósito — só banco (o estoque ML ao
 * vivo só é buscado no Full entrando na coluna final), e devolve apenas as
 * linhas que mudaram, sem recarregar o board inteiro.
 */
export async function PATCH(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { token, organizationId } = auth.ctx;

  const parsedBody = await parseJsonBody(request, bodySchema);
  if (!parsedBody.ok) return parsedBody.response;
  const { cycleIds, columnId, position } = parsedBody.data;

  try {
    const result = await moveReplenishmentCycles(organizationId, cycleIds, columnId, position, {
      accessToken: token,
    });
    if (!result.ok) {
      const { status, error } = ERROR_RESPONSES[result.error];
      return NextResponse.json({ error }, { status });
    }
    return NextResponse.json({ ok: true, rows: result.rows });
  } catch (e) {
    logServerError("api/replenishment-cycles/move PATCH", e);
    return NextResponse.json(apiErrorPayload(e, "replenishment_move_failed"), {
      status: 502,
    });
  }
}
