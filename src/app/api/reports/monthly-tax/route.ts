import { NextRequest, NextResponse } from "next/server";
import {
  generateMonthlyTaxReport,
  loadTaxReportSnapshot,
  recomputeTaxReportFromSavedSales,
  saveTaxReportSnapshot,
  type GenerateMonthlyReportProgress,
} from "@/lib/tax-report/service/generate-monthly-report";
import {
  followUpDreTax,
  loadTaxReportScreen,
  previewTaxReportRecompute,
} from "@/lib/tax-report/service/tax-report-screen";
import type { ManualFiscalOverride } from "@/lib/tax-report/types";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { requireOrganization } from "@/lib/api/api-auth";
import { stripTransacoesForResponse } from "@/lib/tax-report/strip-transacoes-for-response";

export const maxDuration = 300;

function parseYearMonth(searchParams: URLSearchParams): {
  year: number;
  month: number;
} | null {
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));
  if (
    !Number.isInteger(year) ||
    year < 2000 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return null;
  }
  return { year, month };
}

export async function GET(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { userId, organizationId } = auth.ctx;

  const parsed = parseYearMonth(request.nextUrl.searchParams);
  if (!parsed) {
    return NextResponse.json(
      { error: "year e month são obrigatórios" },
      { status: 400 },
    );
  }

  try {
    const screen = await loadTaxReportScreen({
      organizationId,
      sellerId: userId,
      year: parsed.year,
      month: parsed.month,
    });
    if (!screen) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const sku = request.nextUrl.searchParams.get("sku") ?? undefined;
    return NextResponse.json({
      ...stripTransacoesForResponse(screen.payload, sku),
      reportStatus: screen.status,
    });
  } catch (e) {
    logServerError("api/reports/monthly-tax GET", e);
    return NextResponse.json(
      apiErrorPayload(e, "monthly_tax_load_failed"),
      { status: 502 },
    );
  }
}

type PostBody = {
  year?: number;
  month?: number;
  force?: boolean;
  stream?: boolean;
  /**
   * `recompute` = recalcular sobre as vendas já salvas (cadastro, nivelamento,
   * configuração e custos fixos atuais), sem chamar o ML. `preview` = o mesmo
   * cálculo sem gravar nada (antes → depois, inclusive do imposto do DRE).
   */
  mode?: "recompute" | "preview";
  overrides?: Record<string, ManualFiscalOverride>;
};

function sseLine(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { token, userId, organizationId } = auth.ctx;

  let body: PostBody = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const year = Number(body.year);
  const month = Number(body.month);
  if (
    !Number.isInteger(year) ||
    year < 2000 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return NextResponse.json(
      { error: "year e month inválidos" },
      { status: 400 },
    );
  }

  try {
    if (body.mode === "preview") {
      const preview = await previewTaxReportRecompute({
        organizationId,
        sellerId: userId,
        year,
        month,
      });
      if (!preview) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({ preview });
    }

    if (body.mode === "recompute") {
      const payload = await recomputeTaxReportFromSavedSales({
        organizationId,
        sellerId: userId,
        year,
        month,
      });
      if (!payload) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      await saveTaxReportSnapshot(organizationId, userId, payload);
      const dreFollowUp = await followUpDreTax({
        organizationId,
        sellerId: userId,
        year,
        month,
      });
      return NextResponse.json({ ok: true, dreFollowUp });
    }

    if (!body.force) {
      const existing = await loadTaxReportSnapshot(userId, year, month);
      if (existing) {
        if (body.stream) {
          const stream = new ReadableStream({
            start(controller) {
              const encoder = new TextEncoder();
              controller.enqueue(
                encoder.encode(
                  sseLine({
                    type: "progress",
                    phase: "done",
                    message: "Relatório já existente carregado do snapshot.",
                  }),
                ),
              );
              controller.enqueue(
                encoder.encode(sseLine({ type: "complete" })),
              );
              controller.close();
            },
          });
          return new Response(stream, {
            headers: {
              "Content-Type": "text/event-stream; charset=utf-8",
              "Cache-Control": "no-cache, no-transform",
              Connection: "keep-alive",
            },
          });
        }
        return NextResponse.json(existing);
      }
    }

    if (body.stream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const sendProgress = (progress: GenerateMonthlyReportProgress) => {
            controller.enqueue(
              encoder.encode(
                sseLine({
                  type: "progress",
                  ...progress,
                }),
              ),
            );
          };

          try {
            sendProgress({
              phase: "orders",
              message: "Conectando ao Mercado Livre…",
            });

            const payload = await generateMonthlyTaxReport({
              accessToken: token,
              sellerId: userId,
              organizationId,
              year,
              month,
              overrides: body.overrides ?? {},
              onProgress: sendProgress,
            });

            sendProgress({
              phase: "save",
              message: "Salvando snapshot…",
            });

            await saveTaxReportSnapshot(organizationId, userId, payload);
            // O imposto do DRE do mês acompanha a nova versão (só banco).
            sendProgress({
              phase: "save",
              message: "Atualizando o imposto do DRE do mês…",
            });
            const dreFollowUp = await followUpDreTax({
              organizationId,
              sellerId: userId,
              year,
              month,
            });

            controller.enqueue(
              encoder.encode(sseLine({ type: "complete", dreFollowUp })),
            );
          } catch (e) {
            logServerError("api/reports/monthly-tax POST stream", e);
            const message =
              e instanceof Error ? e.message : "monthly_tax_generate_failed";
            controller.enqueue(
              encoder.encode(sseLine({ type: "error", message })),
            );
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    const payload = await generateMonthlyTaxReport({
      accessToken: token,
      sellerId: userId,
      organizationId,
      year,
      month,
      overrides: body.overrides ?? {},
    });

    await saveTaxReportSnapshot(organizationId, userId, payload);
    const dreFollowUp = await followUpDreTax({
      organizationId,
      sellerId: userId,
      year,
      month,
    });
    return NextResponse.json({ ...payload, dreFollowUp });
  } catch (e) {
    logServerError("api/reports/monthly-tax POST", e);
    const message = e instanceof Error ? e.message : "monthly_tax_generate_failed";
    const status = message.includes("Lucro Real") ? 422 : 502;
    return NextResponse.json(apiErrorPayload(e, message), { status });
  }
}
