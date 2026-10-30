import {
  ReconciliationParseError,
  type ReconciliationRow,
} from "@/lib/dre/reconciliation/types";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Recusa a planilha de outro mês. Sem isso, escolher o mês errado no seletor
 * grava as tarifas de um mês no outro (já aconteceu: julho conciliado com a
 * planilha de janeiro). Vale a maioria das operações datadas — a planilha Por
 * Vendas é gerada por data da operação.
 */
export function assertSheetMatchesMonth(
  rows: readonly Pick<ReconciliationRow, "operationDate">[],
  year: number,
  month: number,
): void {
  const byMonth = new Map<string, number>();
  let dated = 0;
  for (const row of rows) {
    const date = row.operationDate;
    if (!date || !Number.isFinite(date.getTime())) continue;
    dated += 1;
    const key = `${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
    byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
  }
  if (dated === 0) return;

  const selected = `${pad(month)}/${year}`;
  const inSelected = byMonth.get(selected) ?? 0;
  if (inSelected * 2 >= dated) return;

  const [predominant, count] = [...byMonth.entries()].sort(
    (a, b) => b[1] - a[1],
  )[0]!;
  throw new ReconciliationParseError(
    "wrong_month",
    `Esta planilha é de ${predominant} (${count} de ${dated} operações), mas o mês escolhido é ${selected}. Escolha o mês certo ou baixe a planilha Por Vendas de ${selected}.`,
  );
}
