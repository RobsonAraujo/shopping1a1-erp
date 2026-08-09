import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getValidAccessToken, readSession } from "@/lib/mercadolibre/session";

export type AuthContext = {
  token: string;
  userId: number;
};

/** Resolves the current ML session for a Route Handler, refreshing the access
 * token if needed. Returns `null` when the request is not authenticated. */
export async function requireAuth(): Promise<AuthContext | null> {
  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);
  const { userId } = readSession(cookieStore);
  if (!token || userId === undefined) return null;
  return { token, userId };
}

export function unauthorizedResponse(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
