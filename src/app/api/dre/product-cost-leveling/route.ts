import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrganization } from "@/lib/api-auth";
import { parseJsonBody } from "@/lib/api-validation";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import {
  createDreProductCostLeveling,
  DreProductCostLevelingError,
  listDreProductCostLevelings,
} from "@/lib/dre/dre-product-cost-leveling";

const levelingBodySchema = z.object({
  sku: z.string().trim().min(1, "SKU is required"),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid startDate"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid endDate"),
  hasIcmsSt: z.boolean(),
  unitCostNf: z.number().finite().nonnegative(),
  purchaseCostWithSt: z.number().finite().nonnegative().nullable(),
  ipiPercent: z.number().finite().min(0).max(100),
});

function levelingErrorResponse(e: DreProductCostLevelingError) {
  const status =
    e.code === "not_found"
      ? 404
      : e.code === "sku_not_found"
        ? 404
        : e.code === "overlap"
          ? 409
          : 400;
  return NextResponse.json({ error: e.code, message: e.message }, { status });
}

export async function GET() {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  try {
    const items = await listDreProductCostLevelings(auth.ctx.organizationId);
    return NextResponse.json({ items });
  } catch (e) {
    logServerError("api/dre/product-cost-leveling GET", e);
    return NextResponse.json(
      apiErrorPayload(e, "dre_product_cost_leveling_failed"),
      { status: 502 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const parsedBody = await parseJsonBody(request, levelingBodySchema);
  if (!parsedBody.ok) return parsedBody.response;

  try {
    const item = await createDreProductCostLeveling(
      auth.ctx.organizationId,
      parsedBody.data,
    );
    return NextResponse.json({ item });
  } catch (e) {
    if (e instanceof DreProductCostLevelingError) {
      return levelingErrorResponse(e);
    }
    logServerError("api/dre/product-cost-leveling POST", e);
    return NextResponse.json(
      apiErrorPayload(e, "dre_product_cost_leveling_create_failed"),
      { status: 502 },
    );
  }
}
