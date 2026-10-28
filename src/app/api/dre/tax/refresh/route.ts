import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrganization } from "@/lib/api/api-auth";
import { parseJsonBody } from "@/lib/api/api-validation";
import { refreshDreSalesTax } from "@/lib/dre/dre-month-data";
import { loadDreYearView } from "@/lib/dre/dre-year-data";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";

const refreshSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  /** Só a prévia (antes → depois), sem gravar. */
  dryRun: z.boolean().optional().default(false),
});

/**
 * "Atualizar imposto": recalcula só os Impostos sobre vendas do mês com o
 * relatório tributário atual, a partir da auditoria salva — sem chamar o ML.
 */
export async function POST(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const parsedBody = await parseJsonBody(request, refreshSchema);
  if (!parsedBody.ok) return parsedBody.response;
  const { year, month, dryRun } = parsedBody.data;
  const { organizationId, userId } = auth.ctx;

  try {
    const result = await refreshDreSalesTax(organizationId, userId, year, month, {
      dryRun,
    });
    if (dryRun) return NextResponse.json({ result });
    const yearView = await loadDreYearView(organizationId, year);
    return NextResponse.json({ result, yearView });
  } catch (error) {
    logServerError("api/dre/tax/refresh POST", error);
    return NextResponse.json(apiErrorPayload(error, "dre_tax_refresh_failed"), {
      status: 502,
    });
  }
}
