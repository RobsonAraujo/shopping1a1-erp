import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { ReplenishmentStatus } from "@/generated/prisma/client";
import {
  advanceReplenishmentCycle,
  loadOperationsBoards,
  transitionReplenishmentCycle,
} from "@/lib/replenishment-cycle-data";
import {
  isValidStatusForKind,
} from "@/lib/replenishment-cycle";
import {
  getValidAccessToken,
  readSession,
} from "@/lib/mercadolibre/session";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { prisma } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string }> };

type PatchBody = {
  status?: unknown;
  advance?: unknown;
  notes?: unknown;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id: cycleId } = await context.params;
  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);
  const { userId } = readSession(cookieStore);

  if (!token || userId === undefined) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const cycle = await prisma.replenishmentCycle.findUnique({
      where: { id: cycleId },
      select: { kind: true, status: true },
    });
    if (!cycle) {
      return NextResponse.json({ error: "Cycle not found" }, { status: 404 });
    }

    if (body.advance === true) {
      const nextStatus = await advanceReplenishmentCycle(cycleId, { accessToken: token });
      const boards = await loadOperationsBoards(token, userId);
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

    await transitionReplenishmentCycle(cycleId, status as ReplenishmentStatus, {
      notes: typeof body.notes === "string" ? body.notes : undefined,
      accessToken: token,
    });
    const boards = await loadOperationsBoards(token, userId);
    return NextResponse.json({ ok: true, ...boards });
  } catch (e) {
    logServerError("api/replenishment-cycles/[id] PATCH", e);
    return NextResponse.json(apiErrorPayload(e, "replenishment_patch_failed"), {
      status: 502,
    });
  }
}
