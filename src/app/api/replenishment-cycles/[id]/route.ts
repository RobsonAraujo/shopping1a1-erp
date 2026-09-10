import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  loadOperationsBoards,
  transitionReplenishmentCycle,
} from "@/lib/compras/replenishment-cycle-data";
import { requireOrganization } from "@/lib/api/api-auth";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { parseJsonBody } from "@/lib/api/api-validation";
import { prisma } from "@/lib/db/db";

type RouteContext = { params: Promise<{ id: string }> };

const patchBodySchema = z.object({
  columnId: z.string().trim().min(1),
  notes: z.string().optional(),
});

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id: cycleId } = await context.params;
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { token, userId, organizationId } = auth.ctx;

  const parsedBody = await parseJsonBody(request, patchBodySchema);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;

  try {
    const cycle = await prisma.replenishmentCycle.findFirst({
      where: { id: cycleId, organizationId },
      select: { kind: true },
    });
    if (!cycle) {
      return NextResponse.json({ error: "Cycle not found" }, { status: 404 });
    }

    await transitionReplenishmentCycle(organizationId, cycleId, body.columnId, {
      notes: typeof body.notes === "string" ? body.notes : undefined,
      accessToken: token,
    });
    const boards = await loadOperationsBoards(
      token,
      userId,
      organizationId,
      cycle.kind,
    );
    return NextResponse.json({ ok: true, ...boards });
  } catch (e) {
    logServerError("api/replenishment-cycles/[id] PATCH", e);
    return NextResponse.json(apiErrorPayload(e, "replenishment_patch_failed"), {
      status: 502,
    });
  }
}
