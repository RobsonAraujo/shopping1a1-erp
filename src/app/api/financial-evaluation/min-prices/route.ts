import { NextRequest, NextResponse } from "next/server";
import { loadFinancialEvaluationRows } from "@/lib/financial-evaluation-data";
import type { MarginBasis } from "@/lib/financial-margin";
import { requireAuth, unauthorizedResponse } from "@/lib/api-auth";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth) return unauthorizedResponse();
  const { token, userId } = auth;

  const targetMarginParam =
    request.nextUrl.searchParams.get("targetMarginPercent");
  const targetMarginPercent = Number(targetMarginParam);
  if (!Number.isFinite(targetMarginPercent)) {
    return NextResponse.json(
      { error: "targetMarginPercent is required" },
      { status: 400 },
    );
  }

  const marginBasisParam = request.nextUrl.searchParams.get("marginBasis");
  const marginBasis: MarginBasis =
    marginBasisParam === "afterAds" ? "afterAds" : "contribution";

  const itemIdsParam = request.nextUrl.searchParams.get("itemIds");
  const itemIds = itemIdsParam
    ? itemIdsParam
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    : undefined;

  try {
    const rows = await loadFinancialEvaluationRows(token, userId, {
      itemIds,
      targetMarginPercent,
      marginBasis,
    });

    return NextResponse.json({
      targetMarginPercent,
      marginBasis,
      patches: rows.map((row) => ({
        mlItemId: row.mlItemId,
        minSalePriceForTarget: row.minSalePriceForTarget ?? null,
        minSalePriceTargetPercent: row.minSalePriceTargetPercent ?? null,
        minSalePriceMarginBasis: row.minSalePriceMarginBasis ?? null,
        minSalePriceRefined: row.minSalePriceRefined ?? false,
      })),
    });
  } catch (e) {
    logServerError("api/financial-evaluation/min-prices GET", e);
    return NextResponse.json(apiErrorPayload(e, "min_prices_failed"), {
      status: 502,
    });
  }
}
