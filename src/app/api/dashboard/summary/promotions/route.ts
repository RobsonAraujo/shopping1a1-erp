import { NextRequest, NextResponse } from "next/server";
import { dashboardSummaryConfig } from "@/config/dashboard-summary";
import { loadPromotionSummary } from "@/lib/home/promotion-summary-data";
import { requireOrganization } from "@/lib/api-auth";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";

function parseExpiringSoonDays(value: string | null): number {
  if (!value) return dashboardSummaryConfig.promotionExpiringSoonDays;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 30) {
    return dashboardSummaryConfig.promotionExpiringSoonDays;
  }
  return parsed;
}

export async function GET(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { token, userId } = auth.ctx;

  const expiringSoonDays = parseExpiringSoonDays(
    request.nextUrl.searchParams.get("days"),
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
