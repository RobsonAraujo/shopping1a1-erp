import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ensureCompanySettings } from "@/lib/product-data";
import { calendarYmdRangeToUtc } from "@/lib/financial-evaluation-period";
import {
  loadFinancialEvaluationRows,
  loadFinancialEvaluationRowsForPeriod,
} from "@/lib/financial-evaluation-data";
import {
  getValidAccessToken,
  readSession,
} from "@/lib/mercadolibre/session";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);
  const { userId } = readSession(cookieStore);

  if (!token || userId === undefined) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const itemIdsParam = request.nextUrl.searchParams.get("itemIds");
  const itemIds = itemIdsParam
    ? itemIdsParam
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    : undefined;

  const targetMarginParam = request.nextUrl.searchParams.get("targetMarginPercent");
  const targetMarginPercent =
    targetMarginParam !== null ? Number(targetMarginParam) : undefined;
  const marginBasisParam = request.nextUrl.searchParams.get("marginBasis");
  const marginBasis =
    marginBasisParam === "afterAds" || marginBasisParam === "contribution"
      ? marginBasisParam
      : undefined;

  const fromParam = request.nextUrl.searchParams.get("from");
  const toParam = request.nextUrl.searchParams.get("to");
  const hasPeriod = Boolean(fromParam || toParam);

  if (hasPeriod) {
    if (!fromParam || !toParam || !calendarYmdRangeToUtc(fromParam, toParam)) {
      return NextResponse.json(
        { error: "Parâmetro from/to inválido. Use YYYY-MM-DD." },
        { status: 400 },
      );
    }
  }

  try {
    const companySettingsPromise = ensureCompanySettings();

    if (hasPeriod && fromParam && toParam) {
      const [periodResult, companySettings] = await Promise.all([
        loadFinancialEvaluationRowsForPeriod(token, userId, fromParam, toParam),
        companySettingsPromise,
      ]);
      return NextResponse.json({
        items: periodResult.items,
        mode: "period" as const,
        from: periodResult.from,
        to: periodResult.to,
        salesCount: periodResult.salesCount,
        periodDays: periodResult.periodDays,
        wholesaleReductions: {
          level1ReductionPercent: companySettings.level1ReductionPercent,
          level2ReductionPercent: companySettings.level2ReductionPercent,
          level3ReductionPercent: companySettings.level3ReductionPercent,
          level1MinPurchaseUnit: companySettings.level1MinPurchaseUnit,
          level2MinPurchaseUnit: companySettings.level2MinPurchaseUnit,
          level3MinPurchaseUnit: companySettings.level3MinPurchaseUnit,
        },
      });
    }

    const [items, companySettings] = await Promise.all([
      loadFinancialEvaluationRows(token, userId, {
        itemIds,
        targetMarginPercent:
          targetMarginPercent !== undefined &&
          Number.isFinite(targetMarginPercent)
            ? targetMarginPercent
            : undefined,
        marginBasis,
      }),
      companySettingsPromise,
    ]);
    return NextResponse.json({
      items,
      mode: "current" as const,
      wholesaleReductions: {
        level1ReductionPercent: companySettings.level1ReductionPercent,
        level2ReductionPercent: companySettings.level2ReductionPercent,
        level3ReductionPercent: companySettings.level3ReductionPercent,
        level1MinPurchaseUnit: companySettings.level1MinPurchaseUnit,
        level2MinPurchaseUnit: companySettings.level2MinPurchaseUnit,
        level3MinPurchaseUnit: companySettings.level3MinPurchaseUnit,
      },
    });
  } catch (e) {
    logServerError("api/financial-evaluation GET", e);
    return NextResponse.json(apiErrorPayload(e, "financial_evaluation_failed"), {
      status: 502,
    });
  }
}
