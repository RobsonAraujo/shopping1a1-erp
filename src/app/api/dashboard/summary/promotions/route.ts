import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { dashboardSummaryConfig } from "@/config/dashboard-summary";
import { loadPromotionSummary } from "@/lib/home/promotion-summary-data";
import {
  getValidAccessToken,
  readSession,
} from "@/lib/mercadolibre/session";
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
  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);
  const { userId } = readSession(cookieStore);

  if (!token || userId === undefined) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
