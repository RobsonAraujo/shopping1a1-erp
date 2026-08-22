/**
 * Preenche `payloadSummary` (resumo sem `porSku[].transacoes`) nos snapshots
 * de relatório tributário (`TaxReportMonthSnapshot`) que já existem no banco
 * mas ainda não têm essa coluna calculada — necessário rodar uma vez após o
 * deploy da migração `20260818120000_tax_report_snapshot_payload_summary`.
 *
 * Não chama a API do Mercado Livre nem reprocessa pedidos: só lê o `payload`
 * completo já salvo, repara (`repairTaxReportPayload`, preenche campos
 * agregados ausentes em snapshots antigos) e grava a versão resumida.
 * Idempotente — pode rodar de novo sem problema (só afeta linhas com
 * `payload_summary IS NULL`).
 *
 * Usage:
 *   npm run backfill:tax-report-summary
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { repairTaxReportPayload } from "../src/lib/tax-report/repair-snapshot-apuracao";
import { stripTransacoesForResponse } from "../src/lib/tax-report/strip-transacoes-for-response";
import type { TaxReportPayload } from "../src/lib/tax-report/types";

async function main() {
  const rows = await prisma.$queryRaw<
    { id: string; seller_id: number; year: number; month: number; payload: unknown }[]
  >`
    SELECT id, seller_id, year, month, payload
    FROM tax_report_month_snapshots
    WHERE payload_summary IS NULL
  `;

  console.log(`Encontrados ${rows.length} snapshot(s) sem payloadSummary.`);

  for (const row of rows) {
    const payload = row.payload as unknown as TaxReportPayload;
    const repaired = await repairTaxReportPayload(row.seller_id, payload);
    const summary = stripTransacoesForResponse(repaired);

    await prisma.taxReportMonthSnapshot.update({
      where: { id: row.id },
      data: { payloadSummary: summary as object },
    });

    console.log(
      `  ok: seller=${row.seller_id} ${row.year}-${row.month} (${summary.porSku.length} SKUs)`,
    );
  }

  console.log("Backfill concluído.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
