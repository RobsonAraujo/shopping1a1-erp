import { NextRequest, NextResponse } from "next/server";
import type { OperationCycleKind } from "@/generated/prisma/client";
import { loadOperationsBoards } from "@/lib/compras/replenishment-cycle-data";
import { requireOrganization } from "@/lib/api/api-auth";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";

function kindFromQuery(request: NextRequest): OperationCycleKind | undefined {
  const raw = request.nextUrl.searchParams.get("kind");
  return raw === "purchase" || raw === "full" ? raw : undefined;
}

export async function GET(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { token, userId, organizationId } = auth.ctx;

  try {
    const boards = await loadOperationsBoards(
      token,
      userId,
      organizationId,
      kindFromQuery(request),
    );
    return NextResponse.json(boards);
  } catch (e) {
    logServerError("api/replenishment-cycles GET", e);
    return NextResponse.json(apiErrorPayload(e, "replenishment_board_failed"), {
      status: 502,
    });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { token, userId, organizationId } = auth.ctx;

  try {
    const boards = await loadOperationsBoards(
      token,
      userId,
      organizationId,
      kindFromQuery(request),
    );
    return NextResponse.json(boards);
  } catch (e) {
    logServerError("api/replenishment-cycles POST sync", e);
    return NextResponse.json(apiErrorPayload(e, "replenishment_sync_failed"), {
      status: 502,
    });
  }
}
