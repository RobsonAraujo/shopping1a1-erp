import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { fetchMe } from "@/lib/mercadolibre/api";
import {
  getValidAccessToken,
  readSession,
} from "@/lib/mercadolibre/session";

export async function GET() {
  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = readSession(cookieStore);
  if (userId === undefined) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const me = await fetchMe(token);
    return NextResponse.json(me);
  } catch {
    return NextResponse.json(
      { error: "Failed to load profile" },
      { status: 502 },
    );
  }
}
