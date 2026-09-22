import { NextRequest, NextResponse } from "next/server";
import { authorizeBearerSecret } from "@/lib/api/api-auth";
import { runInventoryMonthSnapshotBatch } from "@/lib/inventory/inventory-month-snapshot";

/**
 * Fecha o estoque (galpão + ML + custo) do último mês completo, por
 * organização, salvando em `InventoryStockMonthSnapshot`. Roda todo dia
 * (cron-job.org — configuração externa, não muda por tenant, mesmo padrão
 * de api/cron/catalog-competition): processa um lote pequeno de
 * organizações pendentes/com falha por execução (mais antigas primeiro) e
 * continua de onde parou na próxima chamada, sem fila/worker novo.
 */
export const maxDuration = 300;

const CRON_BATCH_SIZE = 5;

export async function POST(request: NextRequest) {
  if (!authorizeBearerSecret(request, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await runInventoryMonthSnapshotBatch(CRON_BATCH_SIZE);

  return NextResponse.json({
    ok: results.every((r) => r.ok),
    processedOrganizations: results.length,
    results,
  });
}
