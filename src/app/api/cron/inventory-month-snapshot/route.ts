import { NextRequest, NextResponse } from "next/server";
import { authorizeBearerSecret } from "@/lib/api/api-auth";
import { runInventoryMonthSnapshotBatch } from "@/lib/inventory/inventory-month-snapshot";

/**
 * Fecha o estoque (galpão + ML + custo) do último mês completo, por
 * organização, salvando em `InventoryStockMonthSnapshot`.
 *
 * Schedule externo (cron-job.org, UTC): `0 6 1-2 * *` — 06:00 UTC (03:00 em
 * America/Sao_Paulo, o timezone de negócio) nos dias 1 e 2 de cada mês.
 * `resolveInventorySnapshotTargetMonth` sempre aponta pro mês ANTERIOR ao
 * mês corrente, então basta já estar em qualquer dia do mês seguinte pra
 * esse alvo estar 100% fechado — não precisa detectar "é o último dia do
 * mês" nem variar o schedule por mês de 28/30/31 dias. O dia 2 é só rede de
 * segurança: se o dia 1 já processou tudo (status "done"), o dia 2 é
 * no-op (createMany com skipDuplicates não insere nada, e a busca por runs
 * "pending"/"failed" não acha nada pra processar); só reprocessa se alguma
 * organização específica tiver falhado no dia 1.
 *
 * Mesmo padrão de api/cron/catalog-competition (bearer `CRON_SECRET`,
 * configuração externa, não muda por tenant): processa um lote pequeno de
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
