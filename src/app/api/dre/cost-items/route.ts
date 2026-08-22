import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { requireOrganization } from "@/lib/api-auth";
import { parseJsonBody } from "@/lib/api-validation";

const costItemBodySchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  section: z.enum(["fixed", "operational", "investment"]).optional(),
  recurring: z.boolean().optional().default(true),
});

const SECTION_MAP = {
  fixed: "FIXED",
  operational: "OPERATIONAL",
  investment: "INVESTMENT",
} as const;

export async function GET() {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  try {
    const items = await prisma.dreCostItem.findMany({
      where: { organizationId: auth.ctx.organizationId, active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, sortOrder: true, recurring: true },
    });
    return NextResponse.json({ items });
  } catch (e) {
    logServerError("api/dre/cost-items GET", e);
    return NextResponse.json(apiErrorPayload(e, "dre_cost_items_failed"), {
      status: 502,
    });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { organizationId } = auth.ctx;

  const parsedBody = await parseJsonBody(request, costItemBodySchema);
  if (!parsedBody.ok) return parsedBody.response;
  const { name, recurring } = parsedBody.data;
  const section = SECTION_MAP[parsedBody.data.section ?? "fixed"];

  try {
    const maxSort = await prisma.dreCostItem.aggregate({
      where: { organizationId, section, active: true },
      _max: { sortOrder: true },
    });
    const item = await prisma.dreCostItem.create({
      data: {
        organizationId,
        name,
        section,
        recurring,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
      select: { id: true, name: true, sortOrder: true, recurring: true },
    });
    return NextResponse.json({ item });
  } catch (e) {
    logServerError("api/dre/cost-items POST", e);
    return NextResponse.json(apiErrorPayload(e, "dre_cost_item_create_failed"), {
      status: 502,
    });
  }
}
