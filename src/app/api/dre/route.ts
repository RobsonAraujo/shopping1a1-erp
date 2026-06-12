import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { loadDreYearView } from "@/lib/dre-year-data";
import {
  getValidAccessToken,
  readSession,
} from "@/lib/mercadolibre/session";
import { getZonedYearMonth } from "@/lib/mercadolibre/revenue-periods";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);
  const { userId } = readSession(cookieStore);

  if (!token || userId === undefined) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const yearParam = request.nextUrl.searchParams.get("year");
  const defaultYear = getZonedYearMonth().year;
  const year = yearParam ? Number(yearParam) : defaultYear;

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }

  try {
    const data = await loadDreYearView(year);
    return NextResponse.json(data);
  } catch (e) {
    logServerError("api/dre GET", e);
    return NextResponse.json(apiErrorPayload(e, "dre_load_failed"), {
      status: 502,
    });
  }
}
