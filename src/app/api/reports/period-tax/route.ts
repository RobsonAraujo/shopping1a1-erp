import { NextRequest, NextResponse } from "next/server";
import { loadTaxReportForPeriod } from "@/lib/tax-report/service/period-report";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { requireAuth, unauthorizedResponse } from "@/lib/api-auth";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 90;

function parseFromTo(searchParams: URLSearchParams): {
  from: string;
  to: string;
} | null {
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!from || !to || !YMD_RE.test(from) || !YMD_RE.test(to)) return null;
  if (from > to) return null;

  const fromDate = new Date(`${from}T00:00:00Z`);
  const toDate = new Date(`${to}T00:00:00Z`);
  const diffDays = (toDate.getTime() - fromDate.getTime()) / 86_400_000;
  if (diffDays > MAX_RANGE_DAYS) return null;

  return { from, to };
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth) return unauthorizedResponse();
  const { userId } = auth;

  const parsed = parseFromTo(request.nextUrl.searchParams);
  if (!parsed) {
    return NextResponse.json(
      { error: `from e to são obrigatórios (YYYY-MM-DD, from <= to, máx. ${MAX_RANGE_DAYS} dias)` },
      { status: 400 },
    );
  }

  try {
    const { payload, missingMonths } = await loadTaxReportForPeriod(
      userId,
      parsed.from,
      parsed.to,
    );
    return NextResponse.json({ ...payload, missingMonths });
  } catch (e) {
    logServerError("api/reports/period-tax GET", e);
    return NextResponse.json(apiErrorPayload(e, "period_tax_load_failed"), {
      status: 502,
    });
  }
}
