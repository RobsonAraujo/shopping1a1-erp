import { NextRequest, NextResponse } from "next/server";
import { requireOrganization } from "@/lib/api/api-auth";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { loadRbt12 } from "@/lib/simples-nacional/rbt12";
import { getZonedYearMonth } from "@/lib/mercadolibre/revenue-periods";

export const maxDuration = 60;

function parseYearMonth(searchParams: URLSearchParams): {
  year: number;
  month: number;
} {
  const now = getZonedYearMonth();
  const year = Number(searchParams.get("year") ?? now.year);
  const month = Number(searchParams.get("month") ?? now.month);
  if (
    !Number.isInteger(year) ||
    year < 2000 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return { year: now.year, month: now.month };
  }
  return { year, month };
}

export async function GET(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { token, userId, organizationId } = auth.ctx;

  const { year, month } = parseYearMonth(request.nextUrl.searchParams);
  const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";

  try {
    const result = await loadRbt12(
      organizationId,
      userId,
      token,
      year,
      month,
      forceRefresh,
    );
    return NextResponse.json(result);
  } catch (e) {
    logServerError("api/reports/simples-nacional/rbt12 GET", e);
    return NextResponse.json(apiErrorPayload(e, "rbt12_load_failed"), {
      status: 502,
    });
  }
}
