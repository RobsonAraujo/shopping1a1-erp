import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  deactivateTaxFixedCostItem,
  endTaxFixedCostItem,
  updateTaxFixedCostItem,
} from "@/lib/tax-report/tax-fixed-cost-data";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { requireOrganization } from "@/lib/api-auth";
import { parseJsonBody } from "@/lib/api-validation";

type RouteContext = { params: Promise<{ id: string }> };

const patchBodySchema = z.object({
  name: z.string().trim().min(1, "Name is required").optional(),
  recurring: z.boolean().optional(),
  end: z
    .object({
      year: z.number().int().min(2000, "Invalid end year/month"),
      month: z.number().int().min(1).max(12, "Invalid end year/month"),
    })
    .optional(),
});

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { organizationId } = auth.ctx;

  const { id } = await context.params;
  const parsedBody = await parseJsonBody(request, patchBodySchema);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;

  if (body.end) {
    const { year, month } = body.end;
    try {
      const item = await endTaxFixedCostItem(organizationId, id, year, month);
      return NextResponse.json({ item });
    } catch (e) {
      logServerError("api/tax-report/fixed-cost-items PATCH (end)", e);
      return NextResponse.json(
        apiErrorPayload(e, "tax_fixed_cost_item_end_failed"),
        { status: 502 },
      );
    }
  }

  const update: { name?: string; recurring?: boolean } = {};
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    update.name = name;
  }
  if (body.recurring !== undefined) {
    update.recurring = Boolean(body.recurring);
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  try {
    const item = await updateTaxFixedCostItem(organizationId, id, update);
    return NextResponse.json({ item });
  } catch (e) {
    logServerError("api/tax-report/fixed-cost-items PATCH", e);
    return NextResponse.json(
      apiErrorPayload(e, "tax_fixed_cost_item_update_failed"),
      { status: 502 },
    );
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const { id } = await context.params;

  try {
    await deactivateTaxFixedCostItem(auth.ctx.organizationId, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    logServerError("api/tax-report/fixed-cost-items DELETE", e);
    return NextResponse.json(
      apiErrorPayload(e, "tax_fixed_cost_item_delete_failed"),
      { status: 502 },
    );
  }
}
