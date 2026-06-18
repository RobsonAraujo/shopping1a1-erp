import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  generateMonthlyTaxReport,
  loadTaxReportSnapshot,
  saveTaxReportSnapshot,
  type GenerateMonthlyReportProgress,
} from "@/lib/tax-report/service/generate-monthly-report";
import type { ManualFiscalOverride } from "@/lib/tax-report/types";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import {
  getValidAccessToken,
  readSession,
} from "@/lib/mercadolibre/session";

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
  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);
  const { userId } = readSession(cookieStore);

  if (!token || userId === undefined) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = parseYearMonth(request.nextUrl.searchParams);
  if (!parsed) {
    return NextResponse.json(
      { error: "year e month são obrigatórios" },
      { status: 400 },
    );
  }

  try {
    const snapshot = await loadTaxReportSnapshot(
      userId,
      parsed.year,
      parsed.month,
    );
    if (!snapshot) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(snapshot);
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
  overrides?: Record<string, ManualFiscalOverride>;
};

function sseLine(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);
  const { userId } = readSession(cookieStore);

  if (!token || userId === undefined) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
                encoder.encode(sseLine({ type: "complete", payload: existing })),
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
              year,
              month,
              overrides: body.overrides ?? {},
              onProgress: sendProgress,
            });

            await saveTaxReportSnapshot(userId, payload);
            controller.enqueue(
              encoder.encode(sseLine({ type: "complete", payload })),
            );
          } catch (e) {
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
      year,
      month,
      overrides: body.overrides ?? {},
    });

    await saveTaxReportSnapshot(userId, payload);
    return NextResponse.json(payload);
  } catch (e) {
    logServerError("api/reports/monthly-tax POST", e);
    const message = e instanceof Error ? e.message : "monthly_tax_generate_failed";
    const status = message.includes("Lucro Real") ? 422 : 502;
    return NextResponse.json(apiErrorPayload(e, message), { status });
  }
}
