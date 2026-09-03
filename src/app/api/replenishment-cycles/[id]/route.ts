import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { ReplenishmentStatus } from "@/generated/prisma/client";
import {
  advanceReplenishmentCycle,
  loadOperationsBoards,
  transitionReplenishmentCycle,
} from "@/lib/compras/replenishment-cycle-data";
import {
  isValidStatusForKind,
} from "@/lib/compras/replenishment-cycle";
import { requireOrganization } from "@/lib/api/api-auth";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { parseJsonBody } from "@/lib/api/api-validation";
import { prisma } from "@/lib/db/db";

type RouteContext = { params: Promise<{ id: string }> };

const patchBodySchema = z.object({
  status: z.string().optional(),
  advance: z.boolean().optional(),
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
      select: { kind: true, status: true },
    });
    if (!cycle) {
      return NextResponse.json({ error: "Cycle not found" }, { status: 404 });
    }

    if (body.advance === true) {
      const nextStatus = await advanceReplenishmentCycle(organizationId, cycleId, {
        accessToken: token,
      });
      const boards = await loadOperationsBoards(token, userId, organizationId);
      return NextResponse.json({ ok: true, nextStatus, ...boards });
    }

    const status = body.status;
    if (typeof status !== "string") {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    if (
      !isValidStatusForKind(
        cycle.kind,
        status as ReplenishmentStatus,
      )
    ) {
      return NextResponse.json({ error: "Invalid status for cycle kind" }, {
        status: 400,
      });
    }

    await transitionReplenishmentCycle(
      organizationId,
      cycleId,
      status as ReplenishmentStatus,
      {
        notes: typeof body.notes === "string" ? body.notes : undefined,
        accessToken: token,
      },
    );
    const boards = await loadOperationsBoards(token, userId, organizationId);
    return NextResponse.json({ ok: true, ...boards });
  } catch (e) {
    logServerError("api/replenishment-cycles/[id] PATCH", e);
    return NextResponse.json(apiErrorPayload(e, "replenishment_patch_failed"), {
      status: 502,
    });
  }
}
