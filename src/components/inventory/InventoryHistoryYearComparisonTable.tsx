"use client";

import { useMemo, useState } from "react";
import { FormSelect } from "@/components/ui/form-select";
import {
  MONTH_NAMES_PT,
  formatStockReportCurrency,
  formatStockReportUnits,
} from "@/lib/inventory/inventory-stock-report";
import type { InventoryMonthSnapshotEvolution } from "@/lib/inventory/inventory-month-snapshot-report";

function monthKeyYear(monthKey: string): number {
  return Number(monthKey.split("-")[0]);
}

function monthKeyShortLabel(monthKey: string): string {
  const month = Number(monthKey.split("-")[1]);
  return MONTH_NAMES_PT[month - 1]?.slice(0, 3) ?? monthKey;
}

/**
 * Comparação mês a mês por SKU, um ano por vez — separado do relatório do
 * mês (que já tem suas próprias colunas de Unidades/Valor pro mês
 * selecionado) pra não misturar "o número de agora" com "a evolução ao
 * longo do tempo" na mesma tabela.
 */
export function InventoryHistoryYearComparisonTable({
  evolution,
}: {
  evolution: InventoryMonthSnapshotEvolution;
}) {
  const years = useMemo(() => {
    const set = new Set(evolution.monthKeys.map(monthKeyYear));
    return [...set].sort((a, b) => b - a);
  }, [evolution.monthKeys]);

  const [selectedYear, setSelectedYear] = useState<number | null>(
    years[0] ?? null,
  );
  const effectiveYear =
    selectedYear != null && years.includes(selectedYear)
      ? selectedYear
      : (years[0] ?? null);

  const monthKeysForYear = useMemo(
    () =>
      evolution.monthKeys
        .filter((key) => monthKeyYear(key) === effectiveYear)
        .sort(),
    [evolution.monthKeys, effectiveYear],
  );

  const rowsForYear = useMemo(
    () =>
      evolution.rows
        .filter((row) =>
          monthKeysForYear.some((key) => (row.unitsByMonthKey[key] ?? 0) > 0),
        )
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" })),
    [evolution.rows, monthKeysForYear],
  );

  if (years.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-10 text-center text-sm text-[var(--muted-foreground)]">
        Ainda não há meses fechados suficientes pra comparar.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <FormSelect
        label="Ano"
        value={String(effectiveYear)}
        onValueChange={(value) => setSelectedYear(Number(value))}
        options={years.map((year) => ({ value: String(year), label: String(year) }))}
        triggerClassName="w-32"
      />

      {rowsForYear.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-10 text-center text-sm text-[var(--muted-foreground)]">
          Nenhum produto com estoque em {effectiveYear}.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--muted)]/50 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                <th className="px-3 py-2">Produto</th>
                {monthKeysForYear.map((monthKey) => (
                  <th key={monthKey} className="px-3 py-2 text-right">
                    {monthKeyShortLabel(monthKey)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowsForYear.map((row) => (
                <tr
                  key={row.skuKey}
                  className="border-b border-[var(--border)] last:border-0"
                >
                  <td className="px-3 py-2 font-medium">{row.label}</td>
                  {monthKeysForYear.map((monthKey) => {
                    const units = row.unitsByMonthKey[monthKey];
                    const value = row.valueByMonthKey[monthKey];
                    return (
                      <td
                        key={monthKey}
                        className="px-3 py-2 text-right tabular-nums"
                      >
                        {units != null ? (
                          <>
                            <div>{formatStockReportUnits(units)}</div>
                            <div className="text-[10px] text-[var(--muted-foreground)]">
                              {value != null
                                ? formatStockReportCurrency(value)
                                : "—"}
                            </div>
                          </>
                        ) : (
                          <span className="text-[var(--muted-foreground)]">
                            —
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
