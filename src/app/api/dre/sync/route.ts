import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  DRE_EDITABLE_LINE_KEYS,
  type DreEditableLineKey,
} from "@/lib/dre/dre-calculations";
import { loadDreYearView } from "@/lib/dre/dre-year-data";
import {
  buildDreMonthSnapshot,
  persistDreMonthSnapshot,
} from "@/lib/dre/dre-month-data";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { requireAuth, unauthorizedResponse } from "@/lib/api-auth";
import { parseJsonBody } from "@/lib/api-validation";
import { isDreMonthSyncable } from "@/lib/mercadolibre/revenue-periods";

const syncBodySchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  preserveLineKeys: z
    .array(
      z.enum(
        DRE_EDITABLE_LINE_KEYS as unknown as [
          DreEditableLineKey,
          ...DreEditableLineKey[],
        ],
      ),
    )
    .optional()
    .default([]),
});

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth) return unauthorizedResponse();
  const { token, userId } = auth;

  const parsedBody = await parseJsonBody(request, syncBodySchema);
  if (!parsedBody.ok) return parsedBody.response;
  const { year, month, preserveLineKeys } = parsedBody.data;

  if (!isDreMonthSyncable(year, month)) {
    return NextResponse.json(
      { error: "Não é possível sincronizar meses futuros." },
      { status: 400 },
    );
  }

  try {
    const payload = await buildDreMonthSnapshot(token, userId, year, month);
    const syncedAt = await persistDreMonthSnapshot(
      year,
      month,
      payload,
      preserveLineKeys,
    );
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
