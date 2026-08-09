import { NextResponse } from "next/server";
import { fetchMe } from "@/lib/mercadolibre/api";
import { requireAuth, unauthorizedResponse } from "@/lib/api-auth";

export async function GET() {
  const auth = await requireAuth();
  if (!auth) return unauthorizedResponse();

  try {
    const me = await fetchMe(auth.token);
    return NextResponse.json(me);
  } catch {
    return NextResponse.json(
      { error: "Failed to load profile" },
      { status: 502 },
    );
  }
}
