import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrganization } from "@/lib/api/api-auth";
import { parseJsonBody } from "@/lib/api/api-validation";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import {
  RotinaSimulationNotFoundError,
  SIMULATABLE_LISTING_TYPES,
  simulateListingPrices,
} from "@/lib/rotina/simulate";

export const maxDuration = 60;

const bodySchema = z.object({
  mlItemId: z.string().regex(/^[A-Z]{3}\d+$/, "mlItemId inválido"),
  /** Até 5 preços por vez (ex.: preço p/ ganhar + o que o usuário digitou). */
  prices: z.array(z.number().positive().max(10_000_000)).min(1).max(5),
  /** Simular no outro tipo (Clássico ↔ Premium). Omitido = o tipo de hoje. */
  listingTypeId: z.enum(SIMULATABLE_LISTING_TYPES).optional(),
});

/** "E se eu vender a R$ X?" — margem MC e após ADS em cada preço pedido. */
export async function POST(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { token, userId, organizationId } = auth.ctx;

  const parsedBody = await parseJsonBody(request, bodySchema);
  if (!parsedBody.ok) return parsedBody.response;

  try {
    const simulation = await simulateListingPrices(organizationId, {
      token,
      userId,
      mlItemId: parsedBody.data.mlItemId,
      prices: parsedBody.data.prices,
      listingTypeId: parsedBody.data.listingTypeId,
    });
    return NextResponse.json(simulation, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    if (e instanceof RotinaSimulationNotFoundError) {
      return NextResponse.json({ error: "rotina_listing_not_found" }, { status: 404 });
    }
    logServerError("api/rotina/simulate POST", e);
    return NextResponse.json(apiErrorPayload(e, "rotina_simulate_failed"), { status: 502 });
  }
}
