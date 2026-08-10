import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowUp, ImageOff, RotateCcw, Undo2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { FormInput } from "@/components/ui/form-input";
import { FormSelect } from "@/components/ui/form-select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  RevenuePotentialTableProps,
  SortKey,
} from "@/components/insights/revenue-potential-table/types";

function fmtBrl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "gap", label: "Gap" },
  { value: "potential", label: "Potencial/mês" },
  { value: "current", label: "Atual/mês" },
  { value: "price", label: "Preço" },
  { value: "dailyAvg", label: "Média/dia" },
  { value: "product", label: "SKU" },
];

export function RevenuePotentialTableMobile({
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
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <FormSelect
          label="Ordenar por"
          value={sortKey}
          onValueChange={(value) => onSort(value as SortKey)}
          options={SORT_OPTIONS}
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={sortDir === "asc" ? "Ordem crescente" : "Ordem decrescente"}
          onClick={() => onSort(sortKey)}
          className="shrink-0"
        >
          {sortDir === "asc" ? (
            <ArrowUp className="size-4" aria-hidden />
          ) : (
            <ArrowDown className="size-4" aria-hidden />
          )}
        </Button>
      </div>

      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.mlItemId}>
            <Card className={cn("p-4 shadow-sm", row.isExcluded && "opacity-50")}>
              <div className="flex items-start gap-3">
                <Link
                  href={`/dashboard/items/${row.mlItemId}`}
                  className="relative shrink-0 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--muted)]"
                >
                  {row.imageUrl ? (
                    <Image
                      src={row.imageUrl}
                      alt={row.title}
                      width={40}
                      height={40}
                      className="size-10 object-contain"
                      sizes="40px"
                    />
                  ) : (
                    <span className="flex size-10 items-center justify-center">
                      <ImageOff
                        className="size-4 text-[var(--muted-foreground)]/60"
                        aria-hidden
                      />
                    </span>
                  )}
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-mono text-sm font-medium text-[var(--foreground)]">
                      {row.sku ?? row.mlItemId}
                    </span>
                    <Badge
                      variant={row.status === "active" ? "success" : "secondary"}
                      className="shrink-0 px-1.5 py-0 text-[10px]"
                    >
                      {row.status === "active" ? "ativo" : "pausado"}
                    </Badge>
                  </div>
                  <p className="truncate text-xs text-[var(--muted-foreground)]">
                    {row.title}
                  </p>
                  {row.estimateBasis === "historical" && (
                    <Badge variant="muted" className="mt-1 px-1.5 py-0 text-[10px]">
                      estimativa histórica
                    </Badge>
                  )}
                </div>
                <button
                  type="button"
                  title={row.isExcluded ? "Voltar a considerar" : "Não considerar na análise"}
                  aria-label={
                    row.isExcluded
                      ? `Voltar a considerar ${row.title} na análise`
                      : `Não considerar ${row.title} na análise`
                  }
                  onClick={() => toggleExcluded(row.mlItemId)}
                  className="shrink-0 cursor-pointer text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                >
                  {row.isExcluded ? (
                    <Undo2 className="size-4" aria-hidden />
                  ) : (
                    <X className="size-4" aria-hidden />
                  )}
                </button>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--border)] pt-3 text-xs">
                <div>
                  <div className="text-[var(--muted-foreground)]">Preço</div>
                  <div>{fmtBrl(row.price)}</div>
                </div>
                <div>
                  <div className="text-[var(--muted-foreground)]">Média/dia</div>
                  <div className="flex items-center gap-1">
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
                      className="w-20"
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
                </div>
                <div>
                  <div className="text-[var(--muted-foreground)]">Potencial/mês</div>
                  <div className="font-medium">{fmtBrl(row.effectivePotential)}</div>
                </div>
                <div>
                  <div className="text-[var(--muted-foreground)]">Atual/mês</div>
                  <div>{fmtBrl(row.currentMonthlyRevenue)}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-[var(--muted-foreground)]">Gap</div>
                  <div className="font-medium text-emerald-700 dark:text-emerald-400">
                    {fmtBrl(row.effectiveGap)}
                  </div>
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
