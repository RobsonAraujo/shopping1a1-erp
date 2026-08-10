import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, ImageOff, RotateCcw, Undo2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FormInput } from "@/components/ui/form-input";
import { cn } from "@/lib/utils";
import type {
  RevenuePotentialTableProps,
  SortKey,
  SortDir,
} from "@/components/insights/revenue-potential-table/types";

function fmtBrl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function SortableTh({
  label,
  sortKey,
  activeKey,
  activeDir,
  onSort,
  className,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  activeDir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
  align?: "left" | "right";
}) {
  const active = activeKey === sortKey;
  const Icon = !active ? ArrowUpDown : activeDir === "asc" ? ArrowUp : ArrowDown;

  return (
    <th className={cn(className, "cursor-pointer")}>
      <button
        type="button"
        className={cn(
          "inline-flex cursor-pointer items-center gap-1 font-medium hover:text-[var(--foreground)]",
          align === "right" && "ml-auto flex-row-reverse",
          active && "text-[var(--foreground)]",
        )}
        onClick={() => onSort(sortKey)}
      >
        {label}
        <Icon className="size-3.5 shrink-0 opacity-70" aria-hidden />
      </button>
    </th>
  );
}

export function RevenuePotentialTableDesktop({
  rows,
  sortKey,
  sortDir,
  onSort,
  overrides,
  setOverride,
  clearOverride,
  toggleExcluded,
}: RevenuePotentialTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted-foreground)]">
            <SortableTh
              label="SKU"
              sortKey="product"
              activeKey={sortKey}
              activeDir={sortDir}
              onSort={onSort}
              className="pb-2 pr-3"
            />
            <th className="pb-2 pr-3 font-medium">Status</th>
            <SortableTh
              label="Preço"
              sortKey="price"
              activeKey={sortKey}
              activeDir={sortDir}
              onSort={onSort}
              className="pb-2 pr-3"
              align="right"
            />
            <SortableTh
              label="Média/dia"
              sortKey="dailyAvg"
              activeKey={sortKey}
              activeDir={sortDir}
              onSort={onSort}
              className="pb-2 pr-3"
              align="right"
            />
            <SortableTh
              label="Potencial/mês"
              sortKey="potential"
              activeKey={sortKey}
              activeDir={sortDir}
              onSort={onSort}
              className="pb-2 pr-3"
              align="right"
            />
            <SortableTh
              label="Atual/mês"
              sortKey="current"
              activeKey={sortKey}
              activeDir={sortDir}
              onSort={onSort}
              className="pb-2 pr-3"
              align="right"
            />
            <SortableTh
              label="Gap"
              sortKey="gap"
              activeKey={sortKey}
              activeDir={sortDir}
              onSort={onSort}
              className="pb-2 pr-3"
              align="right"
            />
            <th className="pb-2 text-right font-medium">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.mlItemId}
              className={cn(
                "border-b border-[var(--border)] last:border-0",
                row.isExcluded && "opacity-40",
              )}
            >
              <td className="max-w-xs py-2 pr-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Link
                    href={`/dashboard/items/${row.mlItemId}`}
                    className="relative shrink-0 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--muted)]"
                  >
                    {row.imageUrl ? (
                      <Image
                        src={row.imageUrl}
                        alt={row.title}
                        width={32}
                        height={32}
                        className="size-8 object-contain"
                        sizes="32px"
                      />
                    ) : (
                      <span className="flex size-8 items-center justify-center">
                        <ImageOff
                          className="size-3.5 text-[var(--muted-foreground)]/60"
                          aria-hidden
                        />
                      </span>
                    )}
                  </Link>
                  <div className="min-w-0">
                    <div className="truncate font-mono font-medium text-[var(--foreground)]">
                      {row.sku ?? row.mlItemId}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
                      <span className="truncate">{row.title}</span>
                      {row.estimateBasis === "historical" && (
                        <Badge variant="muted" className="shrink-0 px-1.5 py-0 text-[10px]">
                          estimativa histórica
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </td>
              <td className="py-2 pr-3">
                <Badge
                  variant={row.status === "active" ? "success" : "secondary"}
                  className="px-1.5 py-0 text-[10px]"
                >
                  {row.status === "active" ? "ativo" : "pausado"}
                </Badge>
              </td>
              <td className="py-2 pr-3 text-right text-[var(--muted-foreground)]">
                {fmtBrl(row.price)}
              </td>
              <td className="py-2 pr-3">
                <div className="flex items-center justify-end gap-1">
                  <FormInput
                    type="number"
                    step="any"
                    min="0"
                    disabled={row.isExcluded}
                    value={
                      row.isOverridden
                        ? overrides[row.mlItemId]
                        : row.effectiveDailyAvg.toFixed(1)
                    }
                    onChange={(e) => {
                      const value = e.target.valueAsNumber;
                      setOverride(
                        row.mlItemId,
                        Number.isFinite(value) ? Math.max(0, value) : 0,
                      );
                    }}
                    className="w-16"
                    inputClassName={cn(
                      "h-8 px-1.5 py-0.5 text-right text-sm tabular-nums",
                      row.isOverridden && "border-[var(--primary)]/50 text-[var(--primary)]",
                    )}
                  />
                  {row.isOverridden && (
                    <button
                      type="button"
                      title="Restaurar estimativa original"
                      aria-label={`Restaurar estimativa original de ${row.title}`}
                      onClick={() => clearOverride(row.mlItemId)}
                      className="cursor-pointer text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                    >
                      <RotateCcw className="size-3.5" aria-hidden />
                    </button>
                  )}
                </div>
              </td>
              <td className="py-2 pr-3 text-right font-medium">
                {fmtBrl(row.effectivePotential)}
              </td>
              <td className="py-2 pr-3 text-right text-[var(--muted-foreground)]">
                {fmtBrl(row.currentMonthlyRevenue)}
              </td>
              <td className="py-2 pr-3 text-right font-medium text-emerald-700 dark:text-emerald-400">
                {fmtBrl(row.effectiveGap)}
              </td>
              <td className="py-2 text-right">
                <button
                  type="button"
                  title={row.isExcluded ? "Voltar a considerar" : "Não considerar na análise"}
                  aria-label={
                    row.isExcluded
                      ? `Voltar a considerar ${row.title} na análise`
                      : `Não considerar ${row.title} na análise`
                  }
                  onClick={() => toggleExcluded(row.mlItemId)}
                  className="cursor-pointer text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                >
                  {row.isExcluded ? (
                    <Undo2 className="size-4" aria-hidden />
                  ) : (
                    <X className="size-4" aria-hidden />
                  )}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
