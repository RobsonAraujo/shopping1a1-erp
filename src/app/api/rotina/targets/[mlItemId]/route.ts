import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrganization } from "@/lib/api/api-auth";
import { parseJsonBody } from "@/lib/api/api-validation";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import {
  ListingTargetConflictError,
  listingBelongsToOrganization,
  saveListingTarget,
} from "@/lib/rotina/listing-targets";
import { ROTINA_MARGIN_LIMITS, ROTINA_TACOS_LIMITS } from "@/lib/rotina/settings-shared";

type RouteContext = { params: Promise<{ mlItemId: string }> };

const bodySchema = z.object({
  /** null = usa o padrão do segmento. */
  minMarginPercent: z
    .number()
    .min(ROTINA_MARGIN_LIMITS.min)
    .max(ROTINA_MARGIN_LIMITS.max)
    .nullable(),
  tacosTargetPercent: z
    .number()
    .min(ROTINA_TACOS_LIMITS.min)
    .max(ROTINA_TACOS_LIMITS.max)
    .nullable(),
});

/** Meta de um anúncio específico (exceção ao padrão). As duas nulas = apaga. */
export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { organizationId } = auth.ctx;
  const { mlItemId } = await context.params;

  if (!/^[A-Z]{3}\d+$/.test(mlItemId)) {
    return NextResponse.json({ error: "rotina_listing_not_found" }, { status: 404 });
  }

  const parsedBody = await parseJsonBody(request, bodySchema);
  if (!parsedBody.ok) return parsedBody.response;

  try {
    if (!(await listingBelongsToOrganization(organizationId, mlItemId))) {
      return NextResponse.json({ error: "rotina_listing_not_found" }, { status: 404 });
    }
    const target = await saveListingTarget(organizationId, mlItemId, parsedBody.data);
    return NextResponse.json({ target }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    if (e instanceof ListingTargetConflictError) {
      return NextResponse.json({ error: "rotina_listing_not_found" }, { status: 404 });
    }
    logServerError("api/rotina/targets PUT", e);
    return NextResponse.json(apiErrorPayload(e, "rotina_target_failed"), { status: 502 });
  }
}
