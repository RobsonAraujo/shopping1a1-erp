import { NextRequest, NextResponse } from "next/server";
import { loadDreYearView } from "@/lib/dre/dre-year-data";
import {
  buildDreMonthSnapshot,
  persistDreMonthSnapshot,
} from "@/lib/dre/dre-month-data";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { requireAuth, unauthorizedResponse } from "@/lib/api-auth";
import { parseJsonBody, yearMonthSchema } from "@/lib/api-validation";
import { isDreMonthSyncable } from "@/lib/mercadolibre/revenue-periods";

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth) return unauthorizedResponse();
  const { token, userId } = auth;

  const parsedBody = await parseJsonBody(request, yearMonthSchema);
  if (!parsedBody.ok) return parsedBody.response;
  const { year, month } = parsedBody.data;

  if (!isDreMonthSyncable(year, month)) {
    return NextResponse.json(
      { error: "Não é possível sincronizar meses futuros." },
      { status: 400 },
    );
  }

  try {
    const payload = await buildDreMonthSnapshot(token, userId, year, month);
    const syncedAt = await persistDreMonthSnapshot(year, month, payload);
    const yearView = await loadDreYearView(year);
    const monthView = yearView.months.find((row) => row.month === month);

    return NextResponse.json({
      syncedAt: syncedAt.toISOString(),
      month: monthView,
      year: yearView.year,
    });
  } catch (e) {
    logServerError("api/dre/sync POST", e);
    return NextResponse.json(apiErrorPayload(e, "dre_sync_failed"), {
      status: 502,
    });
  }
}
