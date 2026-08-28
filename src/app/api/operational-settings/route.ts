import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  loadOperationalSettings,
  updateOperationalSettings,
} from "@/lib/operational-settings";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { requireOrganization } from "@/lib/api-auth";
import { parseJsonBody } from "@/lib/api-validation";

export async function GET() {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  try {
    const settings = await loadOperationalSettings(auth.ctx.organizationId);
    return NextResponse.json({ settings });
  } catch (e) {
    logServerError("api/operational-settings GET", e);
    return NextResponse.json(
      apiErrorPayload(e, "operational_settings_load_failed"),
      { status: 502 },
    );
  }
}

const patchBodySchema = z
  .object({
    salesAverageWindowDays: z.number().int().min(1).max(365),
    leadTimeDays: z.number().int().min(0).max(365),
    activeStockBufferDays: z.number().int().min(0).max(365),
    targetCoverageBufferDays: z.number().int().min(0).max(365),
    rotationHighDailyAvg: z.number().int().min(1).max(100000),
    rotationMediumDailyAvg: z.number().int().min(1).max(100000),
    promotionExpiringSoonDays: z.number().int().min(0).max(365),
  })
  .partial()
  .refine(
    (body) =>
      body.rotationHighDailyAvg === undefined ||
      body.rotationMediumDailyAvg === undefined ||
      body.rotationHighDailyAvg > body.rotationMediumDailyAvg,
    {
      message:
        "O limite de rotação Alta deve ser maior que o limite de rotação Média.",
      path: ["rotationHighDailyAvg"],
    },
  );

export async function PATCH(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const parsedBody = await parseJsonBody(request, patchBodySchema);
  if (!parsedBody.ok) return parsedBody.response;

  try {
    const settings = await updateOperationalSettings(
      auth.ctx.organizationId,
      parsedBody.data,
    );
    // Esses parâmetros alimentam cálculos em várias páginas do dashboard
    // (Estoque, Compras, Operações Full, Início). Sem isto, o Router Cache
    // do Next pode continuar servindo o resultado antigo dessas páginas até
    // expirar sozinho, mesmo com o valor já salvo no banco.
    revalidatePath("/dashboard", "layout");
    return NextResponse.json({ settings });
  } catch (e) {
    logServerError("api/operational-settings PATCH", e);
    return NextResponse.json(
      apiErrorPayload(e, "operational_settings_save_failed"),
      { status: 502 },
    );
  }
}
