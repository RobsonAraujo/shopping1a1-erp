import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  pollCatalogCompetitionForSeller,
} from "@/lib/catalog-report/catalog-competition-poll";
import { recordCatalogPollRun } from "@/lib/catalog-report/catalog-competition-poll-stats";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { requireOrganization } from "@/lib/api-auth";

const bodySchema = z.object({
  itemIds: z.array(z.string()).optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { token, userId, organizationId } = auth.ctx;

  let itemIds: string[] | undefined;
  try {
    const raw: unknown = await request.json();
    const parsed = bodySchema.safeParse(raw);
    itemIds = parsed.success ? parsed.data.itemIds : undefined;
  } catch {
    // optional body
  }

  try {
    const result = await pollCatalogCompetitionForSeller(
      token,
      userId,
      organizationId,
      "manual_poll",
      itemIds,
    );

    await recordCatalogPollRun({
      organizationId,
      source: "manual_poll",
      itemsChecked: result.checked,
      itemsChanged: result.changed,
      ok: result.errors.length === 0 || result.changed > 0,
      errorSummary:
        result.errors.length > 0 ? result.errors.slice(0, 3).join("; ") : null,
    });

    return NextResponse.json({
      ok: true,
      processed: result.checked,
      changed: result.changed,
      total: result.checked,
      errors: result.errors.length,
    });
  } catch (e) {
    logServerError("api/ml/catalog-competition/snapshot", e);
    return NextResponse.json(apiErrorPayload(e, "catalog_snapshot_failed"), {
      status: 502,
    });
  }
}
