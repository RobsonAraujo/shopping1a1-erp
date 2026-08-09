import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { requireAuth, unauthorizedResponse } from "@/lib/api-auth";
import { parseJsonBody } from "@/lib/api-validation";

const costItemBodySchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  section: z.enum(["fixed", "operational"]).optional(),
});

export async function GET() {
  if (!(await requireAuth())) {
    return unauthorizedResponse();
  }

  try {
    const items = await prisma.dreCostItem.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, sortOrder: true },
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
  if (!(await requireAuth())) {
    return unauthorizedResponse();
  }

  const parsedBody = await parseJsonBody(request, costItemBodySchema);
  if (!parsedBody.ok) return parsedBody.response;
  const { name } = parsedBody.data;
  const section = parsedBody.data.section === "operational" ? "OPERATIONAL" : "FIXED";

  try {
    const maxSort = await prisma.dreCostItem.aggregate({
      where: { section, active: true },
      _max: { sortOrder: true },
    });
    const item = await prisma.dreCostItem.create({
      data: {
        name,
        section,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
      select: { id: true, name: true, sortOrder: true },
    });
    return NextResponse.json({ item });
  } catch (e) {
    logServerError("api/dre/cost-items POST", e);
    return NextResponse.json(apiErrorPayload(e, "dre_cost_item_create_failed"), {
      status: 502,
    });
  }
}
