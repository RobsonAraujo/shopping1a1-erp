import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrganization } from "@/lib/api/api-auth";
import { parseJsonBody } from "@/lib/api/api-validation";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { RotinaSimulationNotFoundError, readSimulationAds } from "@/lib/rotina/simulate";

export const maxDuration = 30;

const bodySchema = z.object({
  mlItemId: z.string().regex(/^[A-Z]{3}\d+$/, "mlItemId inválido"),
  basis: z.enum(["today", "7d"]),
});

/**
 * O ADS de um anúncio agora, numa base (hoje ou 7 dias): o "TACOS de hoje" do
 * simular da Central, cujo retrato é de 7 dias. Uma consulta ao Product Ads.
 */
export async function POST(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { token, organizationId } = auth.ctx;

  const parsedBody = await parseJsonBody(request, bodySchema);
  if (!parsedBody.ok) return parsedBody.response;

  try {
    const ads = await readSimulationAds(organizationId, {
      token,
      mlItemId: parsedBody.data.mlItemId,
      basis: parsedBody.data.basis,
    });
    return NextResponse.json(ads, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    if (e instanceof RotinaSimulationNotFoundError) {
      return NextResponse.json({ error: "rotina_listing_not_found" }, { status: 404 });
    }
    logServerError("api/rotina/simulate/ads POST", e);
    return NextResponse.json(apiErrorPayload(e, "rotina_simulate_ads_failed"), { status: 502 });
  }
}
