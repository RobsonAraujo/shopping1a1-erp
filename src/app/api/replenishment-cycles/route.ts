import { NextResponse } from "next/server";
import { loadOperationsBoards } from "@/lib/replenishment-cycle-data";
import { requireOrganization } from "@/lib/api-auth";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";

export async function GET() {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { token, userId, organizationId } = auth.ctx;

  try {
    const boards = await loadOperationsBoards(token, userId, organizationId);
    return NextResponse.json(boards);
  } catch (e) {
    logServerError("api/replenishment-cycles GET", e);
    return NextResponse.json(apiErrorPayload(e, "replenishment_board_failed"), {
      status: 502,
    });
  }
}

export async function POST() {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { token, userId, organizationId } = auth.ctx;

  try {
    const boards = await loadOperationsBoards(token, userId, organizationId);
    return NextResponse.json(boards);
  } catch (e) {
    logServerError("api/replenishment-cycles POST sync", e);
    return NextResponse.json(apiErrorPayload(e, "replenishment_sync_failed"), {
      status: 502,
    });
  }
}
