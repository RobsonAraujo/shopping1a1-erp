import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrganization } from "@/lib/api/api-auth";
import { readSingleFileField } from "@/lib/api/api-validation";
import { ReconciliationParseError } from "@/lib/dre/reconciliation/types";
import { parseReconciliationWorkbook } from "@/lib/dre/reconciliation/xlsx-parser";
import { createPendingReconciliationImport } from "@/lib/dre/reconciliation/reconciliation-data";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { isFutureCalendarMonth } from "@/lib/mercadolibre/revenue-periods";

const MAX_BYTES = 15 * 1024 * 1024;

export const maxDuration = 300;

const yearMonthFormSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

export async function POST(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const fileResult = await readSingleFileField(request, "file", {
    maxBytes: MAX_BYTES,
    allowedExtensions: [".xlsx"],
  });
  if (!fileResult.ok) return fileResult.response;

  const parsedYm = yearMonthFormSchema.safeParse({
    year: fileResult.form.get("year"),
    month: fileResult.form.get("month"),
  });
  if (!parsedYm.success) {
    return NextResponse.json(
      { error: "Informe year e month válidos." },
      { status: 400 },
    );
  }

  if (isFutureCalendarMonth(parsedYm.data.year, parsedYm.data.month)) {
    return NextResponse.json(
      { error: "Não é possível conciliar meses futuros." },
      { status: 400 },
    );
  }

  try {
    const parsed = parseReconciliationWorkbook(fileResult.buffer);
    const result = await createPendingReconciliationImport({
      organizationId: auth.ctx.organizationId,
      year: parsedYm.data.year,
      month: parsedYm.data.month,
      fileName: fileResult.file.name,
      parsed,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ReconciliationParseError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    logServerError("api/dre/reconciliation/preview POST", error);
    return NextResponse.json(
      apiErrorPayload(error, "dre_reconciliation_preview_failed"),
      { status: 502 },
    );
  }
}
