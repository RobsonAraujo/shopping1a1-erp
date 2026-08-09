import { NextRequest, NextResponse } from "next/server";
import {
  pollCatalogCompetitionForSeller,
  resolveCronMlUserId,
} from "@/lib/catalog-report/catalog-competition-poll";
import { recordCatalogPollRun } from "@/lib/catalog-report/catalog-competition-poll-stats";
import { resolveSellerAccessToken } from "@/lib/mercadolibre/persist-seller-tokens";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";

function authorizeCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  return token.length > 0 && token === secret;
}

export async function POST(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mlUserId = await resolveCronMlUserId();
  if (mlUserId === null) {
    return NextResponse.json(
      { error: "No ML seller configured (CRON_ML_USER_ID or credentials)" },
      { status: 503 },
    );
  }

  const token = await resolveSellerAccessToken(mlUserId);
  if (!token) {
    return NextResponse.json(
      { error: "Could not resolve ML access token" },
      { status: 503 },
    );
  }

  try {
    const result = await pollCatalogCompetitionForSeller(
      token,
      mlUserId,
      "cron",
    );

    const run = await recordCatalogPollRun({
      source: "cron",
      itemsChecked: result.checked,
      itemsChanged: result.changed,
      ok: result.errors.length === 0,
      errorSummary:
        result.errors.length > 0 ? result.errors.slice(0, 5).join("; ") : null,
    });

    return NextResponse.json({
      ok: result.errors.length === 0,
      checked: result.checked,
      changed: result.changed,
      ranAt: run.ranAt.toISOString(),
      errors: result.errors.length,
    });
  } catch (e) {
    logServerError("api/cron/catalog-competition", e);
    await recordCatalogPollRun({
      source: "cron",
      itemsChecked: 0,
      itemsChanged: 0,
      ok: false,
      errorSummary: e instanceof Error ? e.message : "cron_failed",
    });
    return NextResponse.json(apiErrorPayload(e, "catalog_cron_failed"), {
      status: 502,
    });
  }
}
