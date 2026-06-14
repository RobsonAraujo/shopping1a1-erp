import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { ReplenishmentStatus } from "@/generated/prisma/client";
import {
  advanceReplenishmentCycle,
  loadReplenishmentBoard,
  transitionReplenishmentCycle,
} from "@/lib/replenishment-cycle-data";
import {
  getValidAccessToken,
  readSession,
} from "@/lib/mercadolibre/session";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";

type RouteContext = { params: Promise<{ id: string }> };

const VALID_STATUSES = new Set<ReplenishmentStatus>([
  "attention",
  "analyzing",
  "quoted",
  "ordered",
  "in_warehouse",
  "full_pending",
  "completed",
]);

type PatchBody = {
  status?: unknown;
  advance?: unknown;
  skipFull?: unknown;
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
    if (body.advance === true) {
      const nextStatus = await advanceReplenishmentCycle(cycleId, {
        skipFull: body.skipFull === true,
      });
      const board = await loadReplenishmentBoard(token, userId);
      return NextResponse.json({ ok: true, nextStatus, ...board });
    }

    const status = body.status;
    if (typeof status !== "string" || !VALID_STATUSES.has(status as ReplenishmentStatus)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    await transitionReplenishmentCycle(cycleId, status as ReplenishmentStatus, {
      notes: typeof body.notes === "string" ? body.notes : undefined,
    });
    const board = await loadReplenishmentBoard(token, userId);
    return NextResponse.json({ ok: true, ...board });
  } catch (e) {
    logServerError("api/replenishment-cycles/[id] PATCH", e);
    return NextResponse.json(apiErrorPayload(e, "replenishment_patch_failed"), {
      status: 502,
    });
  }
}
