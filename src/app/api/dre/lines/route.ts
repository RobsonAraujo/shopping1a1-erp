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
import { requireOrganization } from "@/lib/api-auth";
import { parseJsonBody } from "@/lib/api-validation";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";

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
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const parsedBody = await parseJsonBody(request, linePatchSchema);
  if (!parsedBody.ok) return parsedBody.response;
  const { year, month, lineKey, action, amount } = parsedBody.data;

  try {
    if (action === "restore") {
      await restoreDreMonthLine(auth.ctx.organizationId, year, month, lineKey);
    } else {
      await patchDreMonthLine(auth.ctx.organizationId, year, month, lineKey, amount!);
    }
    const yearView = await loadDreYearView(auth.ctx.organizationId, year);
    return NextResponse.json({ year: yearView });
  } catch (e) {
    logServerError("api/dre/lines PATCH", e);
    return NextResponse.json(apiErrorPayload(e, "dre_line_patch_failed"), {
      status: 502,
    });
  }
}
