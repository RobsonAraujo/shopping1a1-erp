import { NextRequest, NextResponse } from "next/server";
import { loadPromotionSummary } from "@/lib/home/promotion-summary-data";
import { loadOperationalSettings } from "@/lib/operational-settings";
import { requireOrganization } from "@/lib/api-auth";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";

function parseExpiringSoonDays(
  value: string | null,
  defaultDays: number,
): number {
  if (!value) return defaultDays;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 30) {
    return defaultDays;
  }
  return parsed;
}

export async function GET(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { token, userId, organizationId } = auth.ctx;

  const operationalSettings = await loadOperationalSettings(organizationId);
  const expiringSoonDays = parseExpiringSoonDays(
    request.nextUrl.searchParams.get("days"),
    operationalSettings.promotionExpiringSoonDays,
  );

  try {
    const payload = await loadPromotionSummary(token, userId, {
      expiringSoonDays,
    });
    return NextResponse.json(payload);
  } catch (e) {
    logServerError("api/dashboard/summary/promotions GET", e);
    return NextResponse.json(apiErrorPayload(e, "promotion_summary_failed"), {
      status: 502,
    });
  }
}
