import { NextRequest, NextResponse } from "next/server";
import {
  fetchItemsByIds,
  fetchUserItemsSearch,
} from "@/lib/mercadolibre/api";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { requireAuth, unauthorizedResponse } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth) return unauthorizedResponse();
  const { token, userId } = auth;

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
    logServerError("api/ml/items", e);
    return NextResponse.json(apiErrorPayload(e, "items_failed"), {
      status: 502,
    });
  }
}
