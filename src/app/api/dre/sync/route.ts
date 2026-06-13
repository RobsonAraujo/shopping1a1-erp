import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { loadDreYearView } from "@/lib/dre-year-data";
import {
  buildDreMonthSnapshot,
  persistDreMonthSnapshot,
} from "@/lib/dre-month-data";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import {
  getValidAccessToken,
  readSession,
} from "@/lib/mercadolibre/session";
import { isDreMonthSyncable } from "@/lib/mercadolibre/revenue-periods";

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);
  const { userId } = readSession(cookieStore);

  if (!token || userId === undefined) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { year?: number; month?: number };
  try {
    body = (await request.json()) as { year?: number; month?: number };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const year = Number(body.year);
  const month = Number(body.month);

  if (
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 2100 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return NextResponse.json({ error: "Invalid year or month" }, { status: 400 });
  }

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
