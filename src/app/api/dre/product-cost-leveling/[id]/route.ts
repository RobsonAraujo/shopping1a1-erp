import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, unauthorizedResponse } from "@/lib/api-auth";
import { parseJsonBody } from "@/lib/api-validation";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import {
  deleteDreProductCostLeveling,
  DreProductCostLevelingError,
  updateDreProductCostLeveling,
} from "@/lib/dre/dre-product-cost-leveling";

type RouteContext = { params: Promise<{ id: string }> };

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

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!(await requireAuth())) {
    return unauthorizedResponse();
  }

  const { id } = await context.params;
  const parsedBody = await parseJsonBody(request, levelingBodySchema);
  if (!parsedBody.ok) return parsedBody.response;

  try {
    const item = await updateDreProductCostLeveling(id, parsedBody.data);
    return NextResponse.json({ item });
  } catch (e) {
    if (e instanceof DreProductCostLevelingError) {
      return levelingErrorResponse(e);
    }
    logServerError("api/dre/product-cost-leveling PATCH", e);
    return NextResponse.json(
      apiErrorPayload(e, "dre_product_cost_leveling_update_failed"),
      { status: 502 },
    );
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  if (!(await requireAuth())) {
    return unauthorizedResponse();
  }

  const { id } = await context.params;

  try {
    await deleteDreProductCostLeveling(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof DreProductCostLevelingError) {
      return levelingErrorResponse(e);
    }
    logServerError("api/dre/product-cost-leveling DELETE", e);
    return NextResponse.json(
      apiErrorPayload(e, "dre_product_cost_leveling_delete_failed"),
      { status: 502 },
    );
  }
}
