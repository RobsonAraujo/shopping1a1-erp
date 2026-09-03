import { NextRequest, NextResponse } from "next/server";
import { fetchItemById } from "@/lib/mercadolibre/api";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { requireOrganization } from "@/lib/api/api-auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  _request: NextRequest,
  context: RouteContext,
) {
  const { id } = await context.params;
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  try {
    const item = await fetchItemById(auth.ctx.token, id);
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
