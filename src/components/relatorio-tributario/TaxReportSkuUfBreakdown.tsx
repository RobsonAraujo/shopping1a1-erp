"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatFinancialMoney, formatFinancialPercent } from "@/lib/pricing/financial-margin";
import type { SkuVendaPorUf } from "@/lib/tax-report/sku-vendas-por-uf";
import { skuVendaPorUfFilterValue } from "@/lib/tax-report/sku-vendas-por-uf";
import { cn } from "@/lib/utils";

function buildCollapsedSummary(rows: SkuVendaPorUf[]): string {
  const top = rows.slice(0, 3).map(
    (row) => `${row.uf} ${formatFinancialPercent(row.percentualReceita)}`,
  );
  if (rows.length > 3) {
    top.push(`+${rows.length - 3}`);
  }
  return top.join(" · ");
}

export function TaxReportSkuUfBreakdown({
  rows,
  activeUf,
  onSelectUf,
}: {
  rows: SkuVendaPorUf[];
  activeUf: string;
  onSelectUf: (uf: string) => void;
}) {
  const [open, setOpen] = useState(false);

  if (rows.length === 0) return null;

  const maxPercent = rows[0]?.percentualReceita ?? 0;
  const collapsedSummary = buildCollapsedSummary(rows);

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-[var(--muted)]/20"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? (
          <ChevronDown className="mt-0.5 size-4 shrink-0 text-[var(--muted-foreground)]" />
        ) : (
          <ChevronRight className="mt-0.5 size-4 shrink-0 text-[var(--muted-foreground)]" />
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <MapPin className="size-4 shrink-0" />
            Vendas por UF
            <span className="font-normal text-[var(--muted-foreground)]">
              ({rows.length} {rows.length === 1 ? "estado" : "estados"})
            </span>
          </span>
          <span className="mt-1 block text-xs text-[var(--muted-foreground)]">
            {open
              ? "% da receita do SKU no mês · clique em um estado para filtrar a tabela"
              : collapsedSummary}
          </span>
        </span>
      </button>

      {open ? (
        <ul className="space-y-2 border-t border-[var(--border)] px-4 pt-3 pb-4">
          {rows.map((row) => {
            const filterValue = skuVendaPorUfFilterValue(row.uf);
            const isActive = activeUf.trim().toUpperCase() === filterValue;
            const barWidth =
              maxPercent > 0
                ? Math.max(4, (row.percentualReceita / maxPercent) * 100)
                : 0;

            return (
              <li key={row.uf}>
                <button
                  type="button"
                  className={cn(
                    "w-full rounded-lg border px-3 py-2 text-left transition-colors",
                    isActive
                      ? "border-[var(--primary)] bg-[var(--primary)]/5"
                      : "border-[var(--border)] hover:bg-[var(--muted)]/30",
                  )}
                  onClick={() => onSelectUf(isActive ? "" : filterValue)}
                >
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium">{row.uf}</span>
                    <span className="tabular-nums">
                      <span className="font-semibold">
                        {formatFinancialPercent(row.percentualReceita)}
                      </span>
                      <span className="ml-2 text-xs text-[var(--muted-foreground)]">
                        {formatFinancialMoney(row.receitaTotal)}
                      </span>
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--muted)]">
                    <div
                      className="h-full rounded-full bg-[var(--primary)]"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-[var(--muted-foreground)]">
                    {row.quantidadeVendas}{" "}
                    {row.quantidadeVendas === 1 ? "venda" : "vendas"} ·{" "}
                    {row.unidadesVendidas}{" "}
                    {row.unidadesVendidas === 1 ? "unidade" : "unidades"}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </Card>
  );
}
