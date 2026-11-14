import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrganization } from "@/lib/api/api-auth";
import { parseJsonBody } from "@/lib/api/api-validation";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import {
  computeFloorForListingType,
  RotinaSimulationNotFoundError,
  SIMULATABLE_LISTING_TYPES,
} from "@/lib/rotina/simulate";

export const maxDuration = 60;

const bodySchema = z.object({
  mlItemId: z.string().regex(/^[A-Z]{3}\d+$/, "mlItemId inválido"),
  listingTypeId: z.enum(SIMULATABLE_LISTING_TYPES),
});

/**
 * "Mínimo no Premium/Clássico": o preço mínimo para a meta se o anúncio fosse
 * do outro tipo. Separado do simulador porque faz ~20–40 cotações no ML.
 */
export async function POST(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { token, userId, organizationId } = auth.ctx;

  const parsedBody = await parseJsonBody(request, bodySchema);
  if (!parsedBody.ok) return parsedBody.response;

  try {
    const result = await computeFloorForListingType(organizationId, {
      token,
      userId,
      mlItemId: parsedBody.data.mlItemId,
      listingTypeId: parsedBody.data.listingTypeId,
    });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    if (e instanceof RotinaSimulationNotFoundError) {
      return NextResponse.json({ error: "rotina_listing_not_found" }, { status: 404 });
    }
    logServerError("api/rotina/simulate/floor POST", e);
    return NextResponse.json(apiErrorPayload(e, "rotina_simulate_floor_failed"), {
      status: 502,
    });
  }
}
