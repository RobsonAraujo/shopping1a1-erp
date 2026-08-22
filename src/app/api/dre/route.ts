import { NextRequest, NextResponse } from "next/server";
import { loadDreYearView } from "@/lib/dre/dre-year-data";
import { requireOrganization } from "@/lib/api-auth";
import { getZonedYearMonth } from "@/lib/mercadolibre/revenue-periods";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";

export async function GET(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const yearParam = request.nextUrl.searchParams.get("year");
  const defaultYear = getZonedYearMonth().year;
  const year = yearParam ? Number(yearParam) : defaultYear;

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }

  try {
    const data = await loadDreYearView(auth.ctx.organizationId, year);
    return NextResponse.json(data);
  } catch (e) {
    logServerError("api/dre GET", e);
    return NextResponse.json(apiErrorPayload(e, "dre_load_failed"), {
      status: 502,
    });
  }
}
