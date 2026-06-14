import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { loadOperationsBoards } from "@/lib/replenishment-cycle-data";
import {
  getValidAccessToken,
  readSession,
} from "@/lib/mercadolibre/session";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";

export async function GET() {
  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);
  const { userId } = readSession(cookieStore);

  if (!token || userId === undefined) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);
  const { userId } = readSession(cookieStore);

  if (!token || userId === undefined) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
