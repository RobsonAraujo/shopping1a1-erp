import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  DRE_EDITABLE_LINE_KEYS,
  type DreEditableLineKey,
} from "@/lib/dre/dre-calculations";
import {
  patchDreMonthLine,
  restoreDreMonthLine,
} from "@/lib/dre/dre-month-data";
import { loadDreYearView } from "@/lib/dre/dre-year-data";
import { requireAuth, unauthorizedResponse } from "@/lib/api-auth";
import { parseJsonBody } from "@/lib/api-validation";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { isFutureCalendarMonth } from "@/lib/mercadolibre/revenue-periods";

const linePatchSchema = z
  .object({
    year: z.number().int().min(2000).max(2100),
    month: z.number().int().min(1).max(12),
    lineKey: z.enum(
      DRE_EDITABLE_LINE_KEYS as unknown as [
        DreEditableLineKey,
        ...DreEditableLineKey[],
      ],
    ),
    action: z.enum(["set", "restore"]).optional().default("set"),
    amount: z.number().finite().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.action === "set" && data.amount === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "amount é obrigatório para action=set",
        path: ["amount"],
      });
    }
  });

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth) return unauthorizedResponse();

  const parsedBody = await parseJsonBody(request, linePatchSchema);
  if (!parsedBody.ok) return parsedBody.response;
  const { year, month, lineKey, action, amount } = parsedBody.data;

  if (isFutureCalendarMonth(year, month)) {
    return NextResponse.json(
      { error: "Não é possível editar meses futuros." },
      { status: 400 },
    );
  }

  try {
    if (action === "restore") {
      await restoreDreMonthLine(year, month, lineKey);
    } else {
      await patchDreMonthLine(year, month, lineKey, amount!);
    }
    const yearView = await loadDreYearView(year);
    return NextResponse.json({ year: yearView });
  } catch (e) {
    logServerError("api/dre/lines PATCH", e);
    return NextResponse.json(apiErrorPayload(e, "dre_line_patch_failed"), {
      status: 502,
    });
  }
}
