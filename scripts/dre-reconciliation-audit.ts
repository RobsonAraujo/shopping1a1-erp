/**
 * Auditoria **somente leitura** das conciliações do DRE — rodar antes (e depois)
 * do deploy da conciliação em um passo.
 *
 * Por que existe: até a correção, todo re-sync de um mês apagava os valores
 * conciliados (a confirmação tirava a marca que os protegia). Este script mostra,
 * por organização e mês, em que estado cada conciliação está e quais linhas do
 * snapshot divergem da planilha guardada no import — é a lista de meses que
 * aparecem como "revisar" na tela do DRE depois do deploy.
 *
 * Nada é escrito no banco. `--backup` grava um JSON local com os snapshots e os
 * imports (sem as linhas da planilha, `entries`) — rede de segurança antes de
 * revisar/reconciliar os meses na tela.
 *
 * Uso (o `DATABASE_URL` do shell tem precedência sobre o `.env`):
 *   npx tsx scripts/dre-reconciliation-audit.ts
 *   npx tsx scripts/dre-reconciliation-audit.ts --org <organizationId>
 *   DATABASE_URL="<prod>" npx tsx scripts/dre-reconciliation-audit.ts --backup ~/dre-backup.json
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../src/lib/db/db";
import {
  getEditableLineAmount,
  isDreEditableLineKey,
  isReconciliationGovernedLineKey,
  type DreEditableLineKey,
} from "../src/lib/dre/dre-calculations";
import { parseSnapshotPayload } from "../src/lib/dre/dre-month-data";
import { resolveMonthReconciliation } from "../src/lib/dre/dre-year-data";

type Args = { org: string | null; backup: string | null };

function parseArgs(argv: string[]): Args {
  const args: Args = { org: null, backup: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--org") args.org = argv[++i] ?? null;
    else if (argv[i] === "--backup") args.backup = argv[++i] ?? null;
  }
  return args;
}

function acceptedKeys(raw: unknown): DreEditableLineKey[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (key): key is DreEditableLineKey =>
      typeof key === "string" && isDreEditableLineKey(key),
  );
}

function aggregationAmounts(
  raw: unknown,
): Partial<Record<DreEditableLineKey, number>> {
  const amounts = (raw as { amounts?: Record<string, unknown> } | null)?.amounts;
  const out: Partial<Record<DreEditableLineKey, number>> = {};
  if (!amounts || typeof amounts !== "object") return out;
  for (const [key, value] of Object.entries(amounts)) {
    const n = Number(value);
    if (isDreEditableLineKey(key) && Number.isFinite(n)) out[key] = n;
  }
  return out;
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 16) : "-");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const organizations = await prisma.organization.findMany({
    where: args.org ? { id: args.org } : undefined,
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const backup: unknown[] = [];
  let reviewTotal = 0;

  for (const org of organizations) {
    const [snapshots, imports] = await Promise.all([
      prisma.dreMonthSnapshot.findMany({
        where: { organizationId: org.id },
        orderBy: [{ year: "asc" }, { month: "asc" }],
      }),
      prisma.dreReconciliationImport.findMany({
        where: { organizationId: org.id },
        orderBy: [{ year: "asc" }, { month: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          year: true,
          month: true,
          fileName: true,
          sheetName: true,
          rowCount: true,
          status: true,
          aggregationJson: true,
          parseWarningsJson: true,
          previousPayloadJson: true,
          acceptedLineKeysJson: true,
          appliedAt: true,
          uploadedAt: true,
          confirmedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);
    if (args.backup) {
      backup.push({ organization: org, snapshots, imports });
    }
    if (snapshots.length === 0 && imports.length === 0) continue;

    console.log(`\n=== ${org.name} (${org.id})`);
    const keys = new Set([
      ...snapshots.map((s) => `${s.year}-${pad(s.month)}`),
      ...imports.map((i) => `${i.year}-${pad(i.month)}`),
    ]);

    for (const key of [...keys].sort()) {
      const [year, month] = key.split("-").map(Number);
      const snapshot = snapshots.find((s) => s.year === year && s.month === month);
      const payload = snapshot ? parseSnapshotPayload(snapshot.payload) : null;
      const monthImports = imports.filter(
        (i) => i.year === year && i.month === month,
      );
      const status = resolveMonthReconciliation(
        payload,
        monthImports.map((i) => ({
          id: i.id,
          month: i.month,
          status: i.status,
          appliedAt: i.appliedAt,
          fileName: i.fileName,
        })),
      );
      const drafts = monthImports.filter(
        (i) => i.status === "pending" && i.appliedAt === null,
      ).length;

      // Divergência só faz sentido contra o import que define o mês.
      const reference =
        monthImports.find((i) => i.id === status.reviewImportId) ??
        monthImports.find((i) => i.id === payload?.reconciliation?.importId) ??
        null;
      const divergent: string[] = [];
      if (reference && payload) {
        const amounts = aggregationAmounts(reference.aggregationJson);
        for (const lineKey of acceptedKeys(reference.acceptedLineKeysJson)) {
          if (!isReconciliationGovernedLineKey(lineKey)) continue;
          const sheet = amounts[lineKey];
          if (sheet === undefined) continue;
          const current = getEditableLineAmount(payload, lineKey);
          if (Math.abs(current - sheet) >= 0.005) {
            divergent.push(`${lineKey}: snapshot ${current} × planilha ${sheet}`);
          }
        }
      }

      if (status.status === "review") reviewTotal += 1;
      console.log(
        `${key}  ${status.status.padEnd(10)} synced=${iso(snapshot?.syncedAt ?? null)}` +
          `  imports=${monthImports.map((i) => `${i.status}${i.appliedAt ? "*" : ""}`).join(",") || "-"}` +
          (drafts ? `  rascunhos=${drafts}` : "") +
          (reference ? `  ref=${reference.fileName}` : ""),
      );
      for (const line of divergent) console.log(`      divergente  ${line}`);
    }
  }

  console.log(
    `\n${reviewTotal} mês(es) em "review" — resolver em DRE → "Revisar conciliação".` +
      "\nLegenda: * = gravado no snapshot (pending* = aplicado e nunca salvo, fluxo antigo).",
  );

  if (args.backup) {
    const path = resolve(args.backup.replace(/^~(?=$|\/)/, process.env.HOME ?? "~"));
    writeFileSync(
      path,
      JSON.stringify({ generatedAt: new Date().toISOString(), data: backup }),
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
