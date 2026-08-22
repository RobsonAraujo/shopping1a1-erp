import { NextRequest, NextResponse } from "next/server";
import { ensureCompanySettings } from "@/lib/product-data";
import { calendarYmdRangeToUtc } from "@/lib/financial-evaluation-period";
import {
  loadFinancialEvaluationRows,
  loadFinancialEvaluationRowsForPeriod,
  type FinancialEvaluationRow,
} from "@/lib/financial-evaluation-data";
import { requireOrganization } from "@/lib/api-auth";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";

export const maxDuration = 300;

type WholesaleReductionsPayload = {
  level1ReductionPercent: number;
  level2ReductionPercent: number;
  level3ReductionPercent: number;
  level1MinPurchaseUnit: number;
  level2MinPurchaseUnit: number;
  level3MinPurchaseUnit: number;
};

function wholesaleReductionsPayload(companySettings: {
  level1ReductionPercent: number;
  level2ReductionPercent: number;
  level3ReductionPercent: number;
  level1MinPurchaseUnit: number;
  level2MinPurchaseUnit: number;
  level3MinPurchaseUnit: number;
}): WholesaleReductionsPayload {
  return {
    level1ReductionPercent: companySettings.level1ReductionPercent,
    level2ReductionPercent: companySettings.level2ReductionPercent,
    level3ReductionPercent: companySettings.level3ReductionPercent,
    level1MinPurchaseUnit: companySettings.level1MinPurchaseUnit,
    level2MinPurchaseUnit: companySettings.level2MinPurchaseUnit,
    level3MinPurchaseUnit: companySettings.level3MinPurchaseUnit,
  };
}

function sseLine(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { token, userId, organizationId } = auth.ctx;

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
  const stream = request.nextUrl.searchParams.get("stream") === "1";

  if (hasPeriod) {
    if (!fromParam || !toParam || !calendarYmdRangeToUtc(fromParam, toParam)) {
      return NextResponse.json(
        { error: "Parâmetro from/to inválido. Use YYYY-MM-DD." },
        { status: 400 },
      );
    }
  }

  if (stream) {
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        const sendRow = (row: FinancialEvaluationRow) => {
          controller.enqueue(encoder.encode(sseLine({ type: "row", row })));
        };

        try {
          const companySettings = await ensureCompanySettings(organizationId);

          if (hasPeriod && fromParam && toParam) {
            const periodResult = await loadFinancialEvaluationRowsForPeriod(
              token,
              userId,
              organizationId,
              fromParam,
              toParam,
              { onRow: sendRow },
            );
            controller.enqueue(
              encoder.encode(
                sseLine({
                  type: "complete",
                  mode: "period" as const,
                  from: periodResult.from,
                  to: periodResult.to,
                  salesCount: periodResult.salesCount,
                  periodDays: periodResult.periodDays,
                  wholesaleReductions: wholesaleReductionsPayload(companySettings),
                }),
              ),
            );
          } else {
            await loadFinancialEvaluationRows(token, userId, organizationId, {
              itemIds,
              targetMarginPercent:
                targetMarginPercent !== undefined &&
                Number.isFinite(targetMarginPercent)
                  ? targetMarginPercent
                  : undefined,
              marginBasis,
              onRow: sendRow,
            });
            controller.enqueue(
              encoder.encode(
                sseLine({
                  type: "complete",
                  mode: "current" as const,
                  wholesaleReductions: wholesaleReductionsPayload(companySettings),
                }),
              ),
            );
          }
        } catch (e) {
          logServerError("api/financial-evaluation GET stream", e);
          const message =
            e instanceof Error ? e.message : "financial_evaluation_failed";
          controller.enqueue(encoder.encode(sseLine({ type: "error", message })));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  try {
    const companySettingsPromise = ensureCompanySettings(organizationId);

    if (hasPeriod && fromParam && toParam) {
      const [periodResult, companySettings] = await Promise.all([
        loadFinancialEvaluationRowsForPeriod(
          token,
          userId,
          organizationId,
          fromParam,
          toParam,
        ),
        companySettingsPromise,
      ]);
      return NextResponse.json({
        items: periodResult.items,
        mode: "period" as const,
        from: periodResult.from,
        to: periodResult.to,
        salesCount: periodResult.salesCount,
        periodDays: periodResult.periodDays,
        wholesaleReductions: wholesaleReductionsPayload(companySettings),
      });
    }

    const [items, companySettings] = await Promise.all([
      loadFinancialEvaluationRows(token, userId, organizationId, {
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
      wholesaleReductions: wholesaleReductionsPayload(companySettings),
    });
  } catch (e) {
    logServerError("api/financial-evaluation GET", e);
    return NextResponse.json(apiErrorPayload(e, "financial_evaluation_failed"), {
      status: 502,
    });
  }
}
