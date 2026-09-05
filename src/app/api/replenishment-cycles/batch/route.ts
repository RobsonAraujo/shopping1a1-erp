import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { OperationCycleKind, ReplenishmentStatus } from "@/generated/prisma/client";
import { transitionReplenishmentCyclesBatch } from "@/lib/compras/replenishment-cycle-data";
import { isValidStatusForKind } from "@/lib/compras/replenishment-cycle";
import { requireOrganization } from "@/lib/api/api-auth";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { parseJsonBody } from "@/lib/api/api-validation";
import { prisma } from "@/lib/db/db";

const bodySchema = z.object({
  cycleIds: z.array(z.string().trim().min(1)).min(1).max(50),
  status: z.string(),
});

/**
 * Transição em lote — usada pelo drag-and-drop do card de fornecedor em
 * Compras (arrastar move todos os ciclos daquele fornecedor de uma vez).
 * Diferente de `PATCH /api/replenishment-cycles/[id]` (usado por Operações
 * Full, item a item), não recarrega o board inteiro — devolve só os ciclos
 * que mudaram, pra não repetir o sweep pesado do Mercado Livre a cada drag.
 */
export async function PATCH(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { organizationId } = auth.ctx;

  const parsedBody = await parseJsonBody(request, bodySchema);
  if (!parsedBody.ok) return parsedBody.response;
  const { cycleIds, status } = parsedBody.data;

  if (status === "completed") {
    return NextResponse.json(
      {
        error:
          "Conclusão de ciclo é automática (sincronização de estoque), não pode ser definida manualmente em lote",
      },
      { status: 400 },
    );
  }

  try {
    const cycles = await prisma.replenishmentCycle.findMany({
      where: { id: { in: cycleIds }, organizationId },
      select: { id: true, kind: true },
    });
    if (cycles.length === 0) {
      return NextResponse.json({ error: "Nenhum ciclo encontrado" }, { status: 404 });
    }
    const kind: OperationCycleKind = cycles[0].kind;
    if (!cycles.every((c) => c.kind === kind)) {
      return NextResponse.json(
        { error: "Todos os ciclos do lote devem ser do mesmo tipo" },
        { status: 400 },
      );
    }
    if (!isValidStatusForKind(kind, status as ReplenishmentStatus)) {
      return NextResponse.json(
        { error: "Status inválido para esse tipo de ciclo" },
        { status: 400 },
      );
    }

    const updated = await transitionReplenishmentCyclesBatch(
      organizationId,
      cycles.map((c) => ({ cycleId: c.id, nextStatus: status as ReplenishmentStatus })),
    );
    return NextResponse.json({ ok: true, updated });
  } catch (e) {
    logServerError("api/replenishment-cycles/batch PATCH", e);
    return NextResponse.json(apiErrorPayload(e, "replenishment_batch_failed"), {
      status: 502,
    });
  }
}
