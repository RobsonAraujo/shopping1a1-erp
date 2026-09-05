import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/db";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { requireOrganization } from "@/lib/api/api-auth";
import { parseJsonBody } from "@/lib/api/api-validation";
import {
  loadDreDisplaySettings,
  toDreVisibilitySettings,
} from "@/lib/dre/dre-display-settings-data";

export async function GET() {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  try {
    const settings = await loadDreDisplaySettings(auth.ctx.organizationId);
    return NextResponse.json(settings);
  } catch (e) {
    logServerError("api/dre/display-settings GET", e);
    return NextResponse.json(
      apiErrorPayload(e, "dre_display_settings_load_failed"),
      { status: 502 },
    );
  }
}

const patchBodySchema = z.object({
  showInvestments: z.boolean().optional(),
  showNonOperationalOut: z.boolean().optional(),
  showNonOperationalIn: z.boolean().optional(),
});

export async function PATCH(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { organizationId } = auth.ctx;

  const parsedBody = await parseJsonBody(request, patchBodySchema);
  if (!parsedBody.ok) return parsedBody.response;
  const { showInvestments, showNonOperationalOut, showNonOperationalIn } =
    parsedBody.data;

  try {
    const row = await prisma.dreDisplaySettings.upsert({
      where: { organizationId },
      create: {
        organizationId,
        ...(showInvestments !== undefined ? { showInvestments } : {}),
        ...(showNonOperationalOut !== undefined
          ? { showNonOperationalOut }
          : {}),
        ...(showNonOperationalIn !== undefined
          ? { showNonOperationalIn }
          : {}),
      },
      update: {
        ...(showInvestments !== undefined ? { showInvestments } : {}),
        ...(showNonOperationalOut !== undefined
          ? { showNonOperationalOut }
          : {}),
        ...(showNonOperationalIn !== undefined
          ? { showNonOperationalIn }
          : {}),
      },
    });
    return NextResponse.json(toDreVisibilitySettings(row));
  } catch (e) {
    logServerError("api/dre/display-settings PATCH", e);
    return NextResponse.json(
      apiErrorPayload(e, "dre_display_settings_update_failed"),
      { status: 502 },
    );
  }
}
