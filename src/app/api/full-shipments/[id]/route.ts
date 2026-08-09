import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteFullShipment,
  updateFullShipment,
} from "@/lib/envios-full/full-shipment-data";
import { FullShipmentValidationError } from "@/lib/envios-full/full-shipment";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { requireAuth, unauthorizedResponse } from "@/lib/api-auth";
import { parseJsonBody } from "@/lib/api-validation";

type RouteContext = { params: Promise<{ id: string }> };

const patchShipmentSchema = z
  .object({
    shippedAt: z.coerce.date({ error: "Informe uma data de envio válida." }),
    totalCost: z.coerce.number().finite(),
    totalUnits: z.coerce.number().finite(),
    notes: z.string().nullable(),
  })
  .partial();

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!(await requireAuth())) {
    return unauthorizedResponse();
  }

  const { id } = await context.params;
  const parsedBody = await parseJsonBody(request, patchShipmentSchema);
  if (!parsedBody.ok) return parsedBody.response;

  try {
    const shipment = await updateFullShipment(id, parsedBody.data);
    return NextResponse.json({ shipment });
  } catch (e) {
    if (e instanceof FullShipmentValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    logServerError("api/full-shipments/[id] PATCH", e);
    return NextResponse.json(apiErrorPayload(e, "full_shipment_update_failed"), {
      status: 502,
    });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  if (!(await requireAuth())) {
    return unauthorizedResponse();
  }

  const { id } = await context.params;

  try {
    await deleteFullShipment(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    logServerError("api/full-shipments/[id] DELETE", e);
    return NextResponse.json(apiErrorPayload(e, "full_shipment_delete_failed"), {
      status: 502,
    });
  }
}
