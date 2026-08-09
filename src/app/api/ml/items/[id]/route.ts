import { NextRequest, NextResponse } from "next/server";
import { fetchItemById } from "@/lib/mercadolibre/api";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { requireAuth, unauthorizedResponse } from "@/lib/api-auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  _request: NextRequest,
  context: RouteContext,
) {
  const { id } = await context.params;
  const auth = await requireAuth();
  if (!auth) return unauthorizedResponse();

  try {
    const item = await fetchItemById(auth.token, id);
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(item);
  } catch (e) {
    logServerError("api/ml/items/[id]", e);
    return NextResponse.json(apiErrorPayload(e, "item_failed"), {
      status: 502,
    });
  }
}
