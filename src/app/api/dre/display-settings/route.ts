import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/db";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { requireOrganization } from "@/lib/api/api-auth";
import { parseJsonBody } from "@/lib/api/api-validation";

/** Preferências de exibição do DRE — puramente visuais, nunca afetam o cálculo. */
function settingsResponse(row: {
  showInvestments: boolean;
  showNonOperationalOut: boolean;
  showNonOperationalIn: boolean;
}) {
  return {
    showInvestments: row.showInvestments,
    showNonOperationalOut: row.showNonOperationalOut,
    showNonOperationalIn: row.showNonOperationalIn,
  };
}

export async function GET() {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  try {
    const row = await prisma.dreDisplaySettings.upsert({
      where: { organizationId: auth.ctx.organizationId },
      create: { organizationId: auth.ctx.organizationId },
      update: {},
    });
    return NextResponse.json(settingsResponse(row));
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
    return NextResponse.json(settingsResponse(row));
  } catch (e) {
    logServerError("api/dre/display-settings PATCH", e);
    return NextResponse.json(
      apiErrorPayload(e, "dre_display_settings_update_failed"),
      { status: 502 },
    );
  }
}
