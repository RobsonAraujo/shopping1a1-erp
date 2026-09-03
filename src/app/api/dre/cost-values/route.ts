import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/db";
import { loadDreYearView } from "@/lib/dre/dre-year-data";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { requireOrganization } from "@/lib/api/api-auth";
import { parseJsonBody } from "@/lib/api/api-validation";

const costValueSchema = z.object({
  costItemId: z.string().trim().min(1),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  amount: z.number().finite().min(0).nullish(),
});

export async function PUT(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { organizationId } = auth.ctx;

  const parsedBody = await parseJsonBody(request, costValueSchema);
  if (!parsedBody.ok) return parsedBody.response;
  const { costItemId, year, month, amount } = parsedBody.data;

  try {
    const item = await prisma.dreCostItem.findFirst({
      where: { id: costItemId, organizationId, active: true },
    });
    if (!item) {
      return NextResponse.json({ error: "Cost item not found" }, { status: 404 });
    }

    if (amount === null || amount === undefined) {
      await prisma.dreCostMonthValue.deleteMany({
        where: { costItemId, organizationId, year, month },
      });
    } else {
      await prisma.dreCostMonthValue.upsert({
        where: {
          costItemId_year_month: { costItemId, year, month },
        },
        create: {
          organizationId,
          costItemId,
          year,
          month,
          amount,
        },
        update: { amount },
      });
    }

    const yearView = await loadDreYearView(organizationId, year);
    return NextResponse.json({ year: yearView });
  } catch (e) {
    logServerError("api/dre/cost-values PUT", e);
    return NextResponse.json(apiErrorPayload(e, "dre_cost_value_failed"), {
      status: 502,
    });
  }
}
