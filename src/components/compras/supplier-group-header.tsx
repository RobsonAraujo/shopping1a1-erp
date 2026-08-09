import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { supplierPathSegment } from "@/lib/purchase-analysis";

type SupplierGroupHeaderProps = {
  supplier: string;
  count: number;
  showAnalyzeLink?: boolean;
};

export function SupplierGroupHeader({
  supplier,
  count,
  showAnalyzeLink = false,
}: SupplierGroupHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--border)]/60 bg-[var(--muted)]/50 px-3 py-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">
          {supplier}
        </span>
        <span className="text-xs text-[var(--muted-foreground)]">
          {count} produto{count !== 1 ? "s" : ""}
        </span>
      </div>
      {showAnalyzeLink ? (
        <Link
          href={`/dashboard/compras/${supplierPathSegment(supplier)}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-[var(--primary)] hover:underline"
        >
          Analisar fornecedor
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}
