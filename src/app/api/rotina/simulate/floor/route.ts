import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrganization } from "@/lib/api/api-auth";
import { parseJsonBody } from "@/lib/api/api-validation";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import {
  computeSimulationFloor,
  RotinaSimulationNotFoundError,
  SIMULATABLE_LISTING_TYPES,
} from "@/lib/rotina/simulate";
import { ROTINA_MARGIN_LIMITS } from "@/lib/rotina/settings-shared";

export const maxDuration = 60;

const bodySchema = z.object({
  mlItemId: z.string().regex(/^[A-Z]{3}\d+$/, "mlItemId inválido"),
  /** Omitido = o tipo de hoje. */
  listingTypeId: z.enum(SIMULATABLE_LISTING_TYPES).optional(),
  /** Margem mínima que o usuário aceita (Calculadora). Omitida = a meta efetiva. */
  targetPercent: z
    .number()
    .min(ROTINA_MARGIN_LIMITS.min)
    .max(ROTINA_MARGIN_LIMITS.max)
    .optional(),
});

/**
 * Preço mínimo para uma meta: "Mínimo no Premium/Clássico" (outro tipo) e
 * "Calcular mínimo p/ X%" (outra meta, na Calculadora). Separado do simulador
 * porque faz ~20–40 cotações no ML.
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
    const result = await computeSimulationFloor(organizationId, {
      token,
      userId,
      mlItemId: parsedBody.data.mlItemId,
      listingTypeId: parsedBody.data.listingTypeId,
      targetPercent: parsedBody.data.targetPercent,
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
