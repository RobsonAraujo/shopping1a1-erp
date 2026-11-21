import { NextResponse } from "next/server";
import { z } from "zod";
import { reportsConfig } from "@/config/reports";
import { requireOrganization } from "@/lib/api/api-auth";
import { parseJsonBody } from "@/lib/api/api-validation";
import { zonedLocalToUtc } from "@/lib/report-timezone";
import { createStockExit } from "@/lib/stock/stock-actions";
import { stockActionErrorResponse } from "@/lib/stock/stock-api-errors";
import { EXIT_REASONS, type ExitReason } from "@/lib/stock/stock-exit";

const bodySchema = z.object({
  reason: z.enum(Object.keys(EXIT_REASONS) as [ExitReason, ...ExitReason[]]),
  /** Dia da saída (`YYYY-MM-DD`, horário de São Paulo). */
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(1000).nullable().optional(),
  lines: z
    .array(
      z.object({
        stockItemId: z.string().min(1).max(64),
        quantity: z.number().int().min(1).max(10_000_000),
      }),
    )
    .min(1)
    .max(200),
});

/** Registra uma saída de estoque (envio ao Full, perda, avaria, brinde…). */
export async function POST(request: Request) {
  const auth = await requireOrganization();
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { userId, organizationId } = auth.ctx;

  const parsed = await parseJsonBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;
  const [y, m, d] = parsed.data.occurredOn.split("-").map(Number);
  const now = new Date();
  const todayParts = new Intl.DateTimeFormat("en-CA", { timeZone: reportsConfig.catalogCompetitionTimezone }).format(now);
  // Hoje vale "agora" (a ordem no extrato fica certa); outro dia, meio-dia daquele dia.
  const occurredAt =
    parsed.data.occurredOn === todayParts
      ? now
      : zonedLocalToUtc(y, m, d, 12, 0, 0, 0, reportsConfig.catalogCompetitionTimezone);

  try {
    const result = await createStockExit({
      organizationId,
      mlUserId: userId,
      reason: parsed.data.reason,
      occurredAt,
      note: parsed.data.note ?? null,
      lines: parsed.data.lines,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return stockActionErrorResponse("api/stock/exits POST", e);
  }
}
