import { NextResponse } from "next/server";
import { fetchMe } from "@/lib/mercadolibre/api";
import { requireOrganization } from "@/lib/api/api-auth";

export async function GET() {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  try {
    const me = await fetchMe(auth.ctx.token);
    return NextResponse.json(me);
  } catch {
    return NextResponse.json(
      { error: "Failed to load profile" },
      { status: 502 },
    );
  }
}
