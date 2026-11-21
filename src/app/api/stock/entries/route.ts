import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrganization } from "@/lib/api/api-auth";
import { parseJsonBody } from "@/lib/api/api-validation";
import { zonedLocalToUtc } from "@/lib/report-timezone";
import { reportsConfig } from "@/config/reports";
import { createStockEntry } from "@/lib/stock/stock-actions";
import { stockActionErrorResponse } from "@/lib/stock/stock-api-errors";

const money = z.number().min(0).max(100_000_000);
const percent = z.number().min(0).max(100);

const bodySchema = z.object({
  /** Dia da chegada no galpão (`YYYY-MM-DD`, horário de São Paulo). */
  arrivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  supplierId: z.string().min(1).max(64).nullable().optional(),
  invoiceNumber: z.string().max(60).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  lines: z
    .array(
      z.object({
        stockItemId: z.string().min(1).max(64),
        quantity: z.number().int().min(1).max(10_000_000),
        cost: z
          .object({
            unitCostNf: money,
            purchaseIcmsPercent: percent,
            hasIcmsSt: z.boolean(),
            purchaseCostWithSt: money.nullable(),
            ipiPercent: percent,
            extraCosts: money,
          })
          .nullable()
          .optional(),
      }),
    )
    .min(1)
    .max(200),
});

/** Registra uma entrada de mercadoria no galpão (um lote por linha). */
export async function POST(request: Request) {
  const auth = await requireOrganization();
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { userId, organizationId } = auth.ctx;

  const parsed = await parseJsonBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;
  const [y, m, d] = parsed.data.arrivedOn.split("-").map(Number);
  // Meio-dia de São Paulo: o dia escolhido não escorrega para o vizinho.
  const arrivedAt = zonedLocalToUtc(y, m, d, 12, 0, 0, 0, reportsConfig.catalogCompetitionTimezone);

  try {
    const result = await createStockEntry({
      organizationId,
      mlUserId: userId,
      arrivedAt,
      supplierId: parsed.data.supplierId ?? null,
      invoiceNumber: parsed.data.invoiceNumber ?? null,
      notes: parsed.data.notes ?? null,
      lines: parsed.data.lines,
    });
    return NextResponse.json({ ok: true, entryId: result.entryId });
  } catch (e) {
    return stockActionErrorResponse("api/stock/entries POST", e);
  }
}
