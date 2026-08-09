import { NextRequest, NextResponse } from "next/server";
import { loadDreYearView } from "@/lib/dre/dre-year-data";
import { requireAuth, unauthorizedResponse } from "@/lib/api-auth";
import { getZonedYearMonth } from "@/lib/mercadolibre/revenue-periods";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth) return unauthorizedResponse();

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
