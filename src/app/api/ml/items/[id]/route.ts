import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { fetchItemById } from "@/lib/mercadolibre/api";
import { getValidAccessToken } from "@/lib/mercadolibre/session";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  _request: NextRequest,
  context: RouteContext,
) {
  const { id } = await context.params;
  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const item = await fetchItemById(token, id);
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(item);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "item_failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
