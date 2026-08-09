import { NextResponse } from "next/server";
import { loadOperationsBoards } from "@/lib/replenishment-cycle-data";
import { requireAuth, unauthorizedResponse } from "@/lib/api-auth";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";

export async function GET() {
  const auth = await requireAuth();
  if (!auth) return unauthorizedResponse();
  const { token, userId } = auth;

  try {
    const boards = await loadOperationsBoards(token, userId);
    return NextResponse.json(boards);
  } catch (e) {
    logServerError("api/replenishment-cycles GET", e);
    return NextResponse.json(apiErrorPayload(e, "replenishment_board_failed"), {
      status: 502,
    });
  }
}

export async function POST() {
  const auth = await requireAuth();
  if (!auth) return unauthorizedResponse();
  const { token, userId } = auth;

  try {
    const boards = await loadOperationsBoards(token, userId);
    return NextResponse.json(boards);
  } catch (e) {
    logServerError("api/replenishment-cycles POST sync", e);
    return NextResponse.json(apiErrorPayload(e, "replenishment_sync_failed"), {
      status: 502,
    });
  }
}
