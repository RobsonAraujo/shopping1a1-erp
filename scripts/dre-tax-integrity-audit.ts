/**
 * Auditoria **somente leitura** da integridade do DRE e do imposto × tributário
 * — rodar antes do deploy (lista o que precisa de atenção) e depois (confere).
 *
 * Por mês, mostra:
 * - linhas cujo valor não bate com a soma da própria auditoria — em destaque
 *   "ZERO COM AUDITORIA", o caso em que o sync ignorou o que a auditoria lista;
 * - Campanhas ADS zerada com cobrança de Ads na auditoria: provável perda por
 *   re-sync de mês com mais de 90 dias (a API de Ads só cobre 90 dias) — o
 *   valor certo precisa ser digitado à mão no DRE (o ajuste é preservado);
 * - imposto: % do DRE sobre a própria base × tributário salvo (o que o DRE lê)
 *   × o que a tela do tributário mostra (reparo de relatório antigo);
 * - estado do tributário: versão antiga, pedidos buscados antes do fechamento.
 *
 * Nada é escrito no banco. `--backup` grava um JSON local com os snapshots do
 * DRE e os relatórios tributários (payload e resumo) — rede de segurança antes
 * de usar "Salvar recálculo" / "Atualizar imposto" / re-sincronizar.
 *
 * Uso (o `DATABASE_URL` do shell tem precedência sobre o `.env`):
 *   npx tsx scripts/dre-tax-integrity-audit.ts --org <organizationId>
 *   DATABASE_URL="<prod>" npx tsx scripts/dre-tax-integrity-audit.ts --org <id> --backup ~/dre-tax-backup.json
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../src/lib/db/db";
import { dreEditableLineLabel } from "../src/lib/dre/dre-table-rows";
import { checkLineAuditConsistency } from "../src/lib/dre/dre-line-audit";
import { parseSnapshotPayload } from "../src/lib/dre/dre-month-data";
import { impostoOperacionalTotalRelatorio } from "../src/lib/tax-report/imposto-operacional";
import { repairTaxReportPayload } from "../src/lib/tax-report/repair-snapshot-apuracao";
import {
  isLegacyTaxReport,
  taxReportOrdersFetchedAt,
} from "../src/lib/tax-report/tax-report-meta";
import { taxReportStaleness } from "../src/lib/tax-report/tax-report-staleness";
import type { TaxReportPayload } from "../src/lib/tax-report/types";

type Args = { org: string | null; backup: string | null };

function parseArgs(argv: string[]): Args {
  const args: Args = { org: null, backup: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--org") args.org = argv[++i] ?? null;
    else if (argv[i] === "--backup") args.backup = argv[++i] ?? null;
  }
  return args;
}

const pad = (n: number) => String(n).padStart(2, "0");
const day = (d: Date | string | null) =>
  d ? new Date(d).toISOString().slice(0, 10) : "-";
const money = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (part: number, base: number) =>
  base > 0 ? `${((part / base) * 100).toFixed(2)}%` : "-";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const organizations = await prisma.organization.findMany({
    where: args.org ? { id: args.org } : undefined,
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const backup: unknown[] = [];
  const totals = {
    zeroWithAudit: 0,
    otherMismatch: 0,
    adsLost: 0,
    reportLegacy: 0,
    reportIncomplete: 0,
    reportUnsaved: 0,
  };

  for (const org of organizations) {
    const [snapshots, reports, sellers] = await Promise.all([
      prisma.dreMonthSnapshot.findMany({
        where: { organizationId: org.id },
        orderBy: [{ year: "asc" }, { month: "asc" }],
      }),
      prisma.taxReportMonthSnapshot.findMany({
        where: { organizationId: org.id },
        orderBy: [{ year: "asc" }, { month: "asc" }],
      }),
      prisma.organizationMlSeller.findMany({
        where: { organizationId: org.id },
        select: { mlUserId: true },
      }),
    ]);
    if (args.backup) {
      backup.push({ organization: org, dreSnapshots: snapshots, taxReports: reports });
    }
    if (snapshots.length === 0 && reports.length === 0) continue;
    console.log(`\n=== ${org.name} (${org.id})`);

    const keys = new Set([
      ...snapshots.map((s) => `${s.year}-${pad(s.month)}`),
      ...reports.map((r) => `${r.year}-${pad(r.month)}`),
    ]);
    for (const key of [...keys].sort()) {
      const [year, month] = key.split("-").map(Number) as [number, number];
      const snapshot = snapshots.find((s) => s.year === year && s.month === month);
      const report = reports.find((r) => r.year === year && r.month === month);
      const payload = snapshot ? parseSnapshotPayload(snapshot.payload) : null;
      const lines: string[] = [];

      if (payload) {
        for (const mismatch of checkLineAuditConsistency(payload)) {
          const label = dreEditableLineLabel(mismatch.lineKey);
          if (mismatch.kind === "zero_with_audit") totals.zeroWithAudit += 1;
          else totals.otherMismatch += 1;
          lines.push(
            `linha × auditoria  ${label}: linha ${money(mismatch.value)} × auditoria ${money(mismatch.auditSum)}${
              mismatch.kind === "zero_with_audit" ? "  [ZERO COM AUDITORIA → re-sincronizar]" : ""
            }`,
          );
        }
        const adsAudit = (payload.adsCostBreakdown ?? []).reduce(
          (sum, item) => sum + Math.abs(item.amount),
          0,
        );
        if (payload.adsCost === 0 && adsAudit > 0.5) {
          totals.adsLost += 1;
          lines.push(
            `ADS zerado com R$ ${money(adsAudit)} de cobrança de Ads na auditoria — provável perda pelo limite de 90 dias; digite o valor à mão no DRE.`,
          );
        }
        // Pedidos pagos tratados como devolvidos = o que saiu do custo/imposto
        // menos o bruto dos cancelados. Num mês sincronizado logo após o
        // fechamento, a regra antiga (not_delivered) incluía pedidos em trânsito.
        const outOfCost = (payload.taxBreakdown ?? []).reduce(
          (sum, item) => sum + (item.cancelledRevenue ?? 0) + (item.returnedRevenue ?? 0),
          0,
        );
        const returnedPaid = outOfCost - (payload.cancelledIncludeOverlay?.revenueGross ?? 0);
        if (returnedPaid > 0.5) {
          lines.push(
            `pedidos pagos tratados como devolvidos (fora do custo/imposto): R$ ${money(returnedPaid)} — com a regra antiga, pedidos em trânsito entravam aqui; re-sincronize o mês.`,
          );
        }
      }

      let reportInfo = "sem tributário";
      if (report) {
        const saved = (report.payloadSummary ?? report.payload) as unknown as TaxReportPayload;
        const stored = report.payload as unknown as TaxReportPayload;
        const savedTax = impostoOperacionalTotalRelatorio(saved);
        let shownInfo = "";
        const sellerId = Number(report.sellerId);
        if (sellers.some((s) => Number(s.mlUserId) === sellerId)) {
          const shown = await repairTaxReportPayload(sellerId, stored);
          const shownTax = impostoOperacionalTotalRelatorio(shown);
          if (Math.abs(shownTax - savedTax) > 1) {
            totals.reportUnsaved += 1;
            shownInfo = ` · TELA ${pct(shownTax, shown.consolidado.faturamento)} (recálculo não salvo → "Salvar recálculo")`;
          }
        }
        const legacy = isLegacyTaxReport(saved);
        const staleness = taxReportStaleness({
          year,
          month,
          ordersFetchedAt: taxReportOrdersFetchedAt(saved.meta),
          generatedAt: report.generatedAt,
          legacy,
        });
        if (staleness.reasons.includes("legacy")) totals.reportLegacy += 1;
        if (staleness.reasons.includes("incomplete")) totals.reportIncomplete += 1;
        reportInfo =
          `tributário salvo ${pct(savedTax, saved.consolidado.faturamento)} (R$ ${money(savedTax)})${shownInfo}` +
          ` · gerado ${day(report.generatedAt)}, pedidos de ${day(taxReportOrdersFetchedAt(saved.meta))}` +
          (staleness.reasons.length ? ` [${staleness.reasons.join(", ")}]` : "") +
          (staleness.completeness === "partial" ? " [mês em andamento]" : "");
      }

      if (payload) {
        const used = payload.taxSource?.report?.generatedAt;
        const dreTax = payload.taxBreakdown
          ? (() => {
              const base = payload.taxBreakdown.reduce((sum, item) => sum + item.revenue, 0);
              return `DRE ${pct(Math.abs(payload.taxErp), base)} (R$ ${money(Math.abs(payload.taxErp))} sobre R$ ${money(base)})` +
                (used
                  ? ` usando a versão de ${day(used)}`
                  : " (sem registro da versão do tributário → 'Atualizar imposto' depois do deploy)");
            })()
          : `DRE R$ ${money(Math.abs(payload.taxErp))} (sem auditoria por produto — só um sync completo do mês atualiza)`;
        lines.unshift(`imposto  ${dreTax} · ${reportInfo}`);
      } else {
        lines.unshift(`sem DRE · ${reportInfo}`);
      }

      console.log(`${key}  sync=${day(snapshot?.syncedAt ?? null)}  fonte=${payload?.billingSource ?? "-"}`);
      for (const line of lines) console.log(`      ${line}`);
    }
  }

  console.log(
    `\nResumo: ${totals.zeroWithAudit} linha(s) zerada(s) com auditoria, ${totals.otherMismatch} outra(s) divergência(s) linha × auditoria, ` +
      `${totals.adsLost} mês(es) com ADS zerado, ${totals.reportUnsaved} tributário(s) com recálculo não salvo, ` +
      `${totals.reportLegacy} de versão antiga, ${totals.reportIncomplete} buscado(s) antes do fechamento do mês.`,
  );

  if (args.backup) {
    const path = resolve(args.backup.replace(/^~(?=$|\/)/, process.env.HOME ?? "~"));
    writeFileSync(
      path,
      JSON.stringify(
        { generatedAt: new Date().toISOString(), data: backup },
        (_key, value) => (typeof value === "bigint" ? value.toString() : value),
      ),
    );
    console.log(`Backup gravado em ${path}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
