import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, ImageOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  SlowMoverSortKey,
  SlowMoversTableProps,
} from "@/components/insights/slow-movers-table/types";

const TIER_LABELS: Record<string, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
  zero: "Sem vendas",
};

function fmt(n: number, decimals = 1): string {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function SortableHeader({
  label,
  sortKey,
  sort,
  onSortChange,
  align = "right",
}: {
  label: string;
  sortKey: SlowMoverSortKey;
  sort: SlowMoversTableProps["sort"];
  onSortChange: SlowMoversTableProps["onSortChange"];
  align?: "left" | "right";
}) {
  const active = sort.key === sortKey;
  const Icon = active ? (sort.direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th className={cn("pb-2 pr-3 font-medium", align === "right" && "text-right")}>
      <button
        type="button"
        onClick={() => onSortChange(sortKey)}
        className={cn(
          "inline-flex cursor-pointer items-center gap-1 hover:text-[var(--foreground)]",
          align === "right" && "flex-row-reverse",
          active && "text-[var(--foreground)]",
        )}
      >
        {label}
        <Icon className="size-3" />
      </button>
    </th>
  );
}

export function SlowMoversTableDesktop({ rows, threshold, sort, onSortChange }: SlowMoversTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted-foreground)]">
            <th className="pb-2 pr-3 font-medium">Produto</th>
            <th className="pb-2 pr-3 font-medium">SKU</th>
            <SortableHeader
              label="Cobertura"
              sortKey="coverageDays"
              sort={sort}
              onSortChange={onSortChange}
            />
            <SortableHeader label="Média/dia" sortKey="dailyAvg" sort={sort} onSortChange={onSortChange} />
            <SortableHeader label="Estoque" sortKey="totalStock" sort={sort} onSortChange={onSortChange} />
            <th className="pb-2 font-medium">Rotação</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.mlItemId}
              className="border-b border-[var(--border)] last:border-0"
            >
              <td className="py-2 pr-3 max-w-[220px]">
                <div className="flex min-w-0 items-center gap-2">
                  <Link
                    href={`/dashboard/items/${row.mlItemId}`}
                    target="_blank"
                    rel="noopener noreferrer"
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
                        <ImageOff className="size-3.5 text-[var(--muted-foreground)]/60" />
                      </span>
                    )}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <a
                      href={`/dashboard/items/${row.mlItemId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate font-medium text-[var(--primary)] hover:underline"
                      title={row.title}
                    >
                      {row.title}
                    </a>
                    {row.catalogListing && (
                      <a
                        href={`/dashboard/catalog-report/${row.mlItemId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 inline-block"
                      >
                        <Badge variant="secondary" className="text-[10px] px-1 py-0 hover:opacity-80">
                          catálogo ↗
                        </Badge>
                      </a>
                    )}
                  </div>
                </div>
              </td>
              <td className="py-2 pr-3 font-mono text-xs text-[var(--muted-foreground)]">
                {row.sku ?? "—"}
              </td>
              <td className="py-2 pr-3 text-right">
                <span
                  className={cn(
                    "font-semibold",
                    row.coverageDays === null || row.performanceTier === "zero"
                      ? "text-red-600"
                      : row.coverageDays > threshold * 2
                        ? "text-orange-600"
                        : "text-yellow-600",
                  )}
                >
                  {row.coverageDays !== null ? `${Math.floor(row.coverageDays)} d` : "∞"}
                </span>
              </td>
              <td className="py-2 pr-3 text-right text-[var(--muted-foreground)]">
                {row.dailyAvg > 0 ? fmt(row.dailyAvg) : "—"}
              </td>
              <td className="py-2 pr-3 text-right">{row.totalStock}</td>
              <td className="py-2">
                <Badge
                  variant={row.performanceTier === "zero" ? "destructive" : "secondary"}
                  className="text-[10px]"
                >
                  {TIER_LABELS[row.performanceTier] ?? row.performanceTier}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
