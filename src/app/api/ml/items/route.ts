import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  fetchItemsByIds,
  fetchUserItemsSearch,
} from "@/lib/mercadolibre/api";
import {
  getValidAccessToken,
  readSession,
} from "@/lib/mercadolibre/session";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);
  const { userId } = readSession(cookieStore);

  if (!token || userId === undefined) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const offset = Math.max(
    0,
    parseInt(request.nextUrl.searchParams.get("offset") ?? "0", 10) || 0,
  );
  const limit = Math.min(
    50,
    Math.max(
      1,
      parseInt(request.nextUrl.searchParams.get("limit") ?? "20", 10) || 20,
    ),
  );

  try {
    const search = await fetchUserItemsSearch(token, userId, offset, limit);
    const items = await fetchItemsByIds(token, search.results);
    return NextResponse.json({ paging: search.paging, items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "items_failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
