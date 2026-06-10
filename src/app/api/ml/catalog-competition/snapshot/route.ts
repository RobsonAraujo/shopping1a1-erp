import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  pollCatalogCompetitionForSeller,
} from "@/lib/catalog-competition-poll";
import { recordCatalogPollRun } from "@/lib/catalog-competition-poll-stats";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { getValidAccessToken, readSession } from "@/lib/mercadolibre/session";

type Body = {
  itemIds?: unknown;
};

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);
  const { userId } = readSession(cookieStore);
  if (!token || userId === undefined) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    // optional body
  }

  const itemIds = Array.isArray(body.itemIds)
    ? body.itemIds.filter((x): x is string => typeof x === "string")
    : undefined;

  try {
    const result = await pollCatalogCompetitionForSeller(
      token,
      userId,
      "manual_poll",
      itemIds,
    );

    await recordCatalogPollRun({
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
