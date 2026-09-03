import { NextRequest, NextResponse } from "next/server";
import { requireOrganization } from "@/lib/api/api-auth";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import {
  compararSimplesXLucroReal,
  simulateLucroRealForMonth,
} from "@/lib/simples-nacional/simulate-lucro-real";
import {
  loadTaxReportSimulationSnapshot,
  saveTaxReportSimulationSnapshot,
} from "@/lib/simples-nacional/simulation-snapshot-data";
import type { GenerateMonthlyReportProgress } from "@/lib/tax-report/service/generate-monthly-report";

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
    const snapshot = await loadTaxReportSimulationSnapshot(
      organizationId,
      userId,
      parsed.year,
      parsed.month,
    );
    if (!snapshot) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const comparacao = await compararSimplesXLucroReal(organizationId, snapshot);
    return NextResponse.json({ comparacao });
  } catch (e) {
    logServerError("api/reports/simples-nacional/simulacao GET", e);
    return NextResponse.json(apiErrorPayload(e, "simulacao_load_failed"), {
      status: 502,
    });
  }
}

type PostBody = {
  year?: number;
  month?: number;
  force?: boolean;
  stream?: boolean;
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
    if (!body.force) {
      const existing = await loadTaxReportSimulationSnapshot(
        organizationId,
        userId,
        year,
        month,
      );
      if (existing) {
        const comparacao = await compararSimplesXLucroReal(
          organizationId,
          existing,
        );
        if (body.stream) {
          const stream = new ReadableStream({
            start(controller) {
              const encoder = new TextEncoder();
              controller.enqueue(
                encoder.encode(
                  sseLine({
                    type: "progress",
                    phase: "done",
                    message: "Simulação já existente carregada do snapshot.",
                  }),
                ),
              );
              controller.enqueue(
                encoder.encode(sseLine({ type: "complete", comparacao })),
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
        return NextResponse.json({ comparacao });
      }
    }

    if (body.stream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const sendProgress = (progress: GenerateMonthlyReportProgress) => {
            controller.enqueue(
              encoder.encode(sseLine({ type: "progress", ...progress })),
            );
          };

          try {
            sendProgress({
              phase: "orders",
              message: "Simulando Lucro Real sobre os dados do mês…",
            });

            const payload = await simulateLucroRealForMonth({
              accessToken: token,
              sellerId: userId,
              organizationId,
              year,
              month,
              onProgress: sendProgress,
            });

            sendProgress({ phase: "save", message: "Salvando simulação…" });

            await saveTaxReportSimulationSnapshot(organizationId, userId, payload);
            const comparacao = await compararSimplesXLucroReal(
              organizationId,
              payload,
            );

            controller.enqueue(
              encoder.encode(sseLine({ type: "complete", comparacao })),
            );
          } catch (e) {
            logServerError(
              "api/reports/simples-nacional/simulacao POST stream",
              e,
            );
            const message =
              e instanceof Error ? e.message : "simulacao_generate_failed";
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

    const payload = await simulateLucroRealForMonth({
      accessToken: token,
      sellerId: userId,
      organizationId,
      year,
      month,
    });
    await saveTaxReportSimulationSnapshot(organizationId, userId, payload);
    const comparacao = await compararSimplesXLucroReal(organizationId, payload);
    return NextResponse.json({ comparacao });
  } catch (e) {
    logServerError("api/reports/simples-nacional/simulacao POST", e);
    const message =
      e instanceof Error ? e.message : "simulacao_generate_failed";
    return NextResponse.json(apiErrorPayload(e, message), { status: 502 });
  }
}
