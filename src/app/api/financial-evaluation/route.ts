import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ensureCompanySettings } from "@/lib/product-data";
import { loadFinancialEvaluationRows } from "@/lib/financial-evaluation-data";
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

  try {
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
      ensureCompanySettings(),
    ]);
    return NextResponse.json({
      items,
      wholesaleReductions: {
        level1ReductionPercent: companySettings.level1ReductionPercent,
        level2ReductionPercent: companySettings.level2ReductionPercent,
        level3ReductionPercent: companySettings.level3ReductionPercent,
      },
    });
  } catch (e) {
    logServerError("api/financial-evaluation GET", e);
    return NextResponse.json(apiErrorPayload(e, "financial_evaluation_failed"), {
      status: 502,
    });
  }
}
