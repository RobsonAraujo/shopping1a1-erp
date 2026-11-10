import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrganization } from "@/lib/api/api-auth";
import { parseJsonBody } from "@/lib/api/api-validation";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { loadRotinaSettings, updateRotinaSettings } from "@/lib/rotina/rotina-settings";
import { ROTINA_RULE_KEYS } from "@/lib/rotina/rule-registry";
import { ROTINA_MARGIN_LIMITS, ROTINA_TACOS_LIMITS } from "@/lib/rotina/settings-shared";

export async function GET() {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  try {
    const settings = await loadRotinaSettings(auth.ctx.organizationId);
    return NextResponse.json({ settings }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    logServerError("api/rotina/settings GET", e);
    return NextResponse.json(apiErrorPayload(e, "rotina_settings_failed"), { status: 502 });
  }
}

const patchSchema = z
  .object({
    ownMinMarginPercent: z.number().min(ROTINA_MARGIN_LIMITS.min).max(ROTINA_MARGIN_LIMITS.max),
    catalogMinMarginPercent: z
      .number()
      .min(ROTINA_MARGIN_LIMITS.min)
      .max(ROTINA_MARGIN_LIMITS.max),
    ownTacosTargetPercent: z.number().min(ROTINA_TACOS_LIMITS.min).max(ROTINA_TACOS_LIMITS.max),
    disabledRules: z.array(z.enum(ROTINA_RULE_KEYS)).max(ROTINA_RULE_KEYS.length),
  })
  .partial();

/** Metas da Rotina (margens mínimas, TACOS meta, regras desligadas). */
export async function PATCH(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const parsedBody = await parseJsonBody(request, patchSchema);
  if (!parsedBody.ok) return parsedBody.response;

  try {
    const settings = await updateRotinaSettings(auth.ctx.organizationId, parsedBody.data);
    revalidatePath("/dashboard/rotina");
    return NextResponse.json({ settings });
  } catch (e) {
    logServerError("api/rotina/settings PATCH", e);
    return NextResponse.json(apiErrorPayload(e, "rotina_settings_failed"), { status: 502 });
  }
}
