import { NextRequest, NextResponse } from "next/server";
import { ensureCompanySettings } from "@/lib/products/product-data";
import { calendarYmdRangeToUtc } from "@/lib/lucratividade/financial-evaluation-period";
import {
  loadFinancialEvaluationRows,
  loadFinancialEvaluationRowsForPeriod,
  type FinancialEvaluationMeta,
  type FinancialEvaluationProgress,
  type FinancialEvaluationRow,
} from "@/lib/lucratividade/financial-evaluation-data";
import { requireOrganization } from "@/lib/api/api-auth";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { pickWholesaleReductions } from "@/lib/pricing/wholesale-pricing";
import {
  sseLine,
  type FinancialEvaluationStreamEvent,
} from "@/lib/lucratividade/financial-evaluation-stream";

export const maxDuration = 300;

/**
 * Código (nunca a mensagem crua, ex.: "fetch failed") pro evento de erro do
 * stream — o client traduz via `formatApiErrorMessage`; o detalhe fica no log.
 */
function streamErrorCode(error: unknown): string {
  const cause = error instanceof Error ? (error.cause as { code?: string } | undefined) : undefined;
  const text = `${error instanceof Error ? error.message : String(error)} ${cause?.code ?? ""}`.toLowerCase();
  if (/\b429\b|rate.?limit|too many requests/.test(text)) return "ml_rate_limited";
  if (
    /fetch failed|econnreset|etimedout|econnrefused|enotfound|socket|und_err|network|\b50[234]\b/.test(
      text,
    )
  ) {
    return "ml_unavailable";
  }
  return "financial_evaluation_failed";
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
  const validTargetMargin =
    targetMarginPercent !== undefined && Number.isFinite(targetMarginPercent)
      ? targetMarginPercent
      : undefined;

  const fromParam = request.nextUrl.searchParams.get("from");
  const toParam = request.nextUrl.searchParams.get("to");
  const hasPeriod = Boolean(fromParam || toParam);
  const stream = request.nextUrl.searchParams.get("stream") === "1";

  if (hasPeriod) {
    if (!fromParam || !toParam || !calendarYmdRangeToUtc(fromParam, toParam)) {
      return NextResponse.json(
        { error: "invalid_date_range" },
        { status: 400 },
      );
    }
  }

  if (stream) {
    const encoder = new TextEncoder();
    // O client aborta ao trocar de período: para de buscar no ML em vez de
    // terminar um scan de 90 dias que ninguém vai ler.
    const abort = new AbortController();
    request.signal.addEventListener("abort", () => abort.abort());
    let closed = false;

    const readable = new ReadableStream({
      async start(controller) {
        const send = (event: FinancialEvaluationStreamEvent) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(sseLine(event)));
          } catch {
            closed = true;
            abort.abort();
          }
        };
        const streamOptions = {
          onRow: (row: FinancialEvaluationRow) => send({ type: "row", row }),
          onMeta: (meta: FinancialEvaluationMeta) =>
            send({ type: "meta", ...meta }),
          onProgress: (progress: FinancialEvaluationProgress) =>
            send({ type: "progress", ...progress }),
          signal: abort.signal,
        };

        try {
          if (hasPeriod && fromParam && toParam) {
            const periodResult = await loadFinancialEvaluationRowsForPeriod(
              token,
              userId,
              organizationId,
              fromParam,
              toParam,
              streamOptions,
            );
            send({
              type: "complete",
              mode: "period",
              from: periodResult.from,
              to: periodResult.to,
              salesCount: periodResult.salesCount,
              periodDays: periodResult.periodDays,
            });
          } else {
            await loadFinancialEvaluationRows(token, userId, organizationId, {
              itemIds,
              targetMarginPercent: validTargetMargin,
              marginBasis,
              ...streamOptions,
            });
            send({ type: "complete", mode: "current" });
          }
        } catch (e) {
          if (!abort.signal.aborted) {
            logServerError("api/financial-evaluation GET stream", e);
            send({ type: "error", message: streamErrorCode(e) });
          }
        } finally {
          if (!closed) {
            closed = true;
            try {
              controller.close();
            } catch {
              // já fechado pelo cancelamento do client
            }
          }
        }
      },
      cancel() {
        closed = true;
        abort.abort();
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
        meta: periodResult.meta,
        wholesaleReductions: pickWholesaleReductions(companySettings),
      });
    }

    const [items, companySettings] = await Promise.all([
      loadFinancialEvaluationRows(token, userId, organizationId, {
        itemIds,
        targetMarginPercent: validTargetMargin,
        marginBasis,
      }),
      companySettingsPromise,
    ]);
    return NextResponse.json({
      items,
      mode: "current" as const,
      wholesaleReductions: pickWholesaleReductions(companySettings),
    });
  } catch (e) {
    logServerError("api/financial-evaluation GET", e);
    return NextResponse.json(apiErrorPayload(e, "financial_evaluation_failed"), {
      status: 502,
    });
  }
}
