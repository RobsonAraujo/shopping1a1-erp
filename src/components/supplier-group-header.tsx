type SupplierGroupHeaderProps = {
  supplier: string;
  count: number;
};

export function SupplierGroupHeader({
  supplier,
  count,
}: SupplierGroupHeaderProps) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-[var(--border)]/60 bg-[var(--muted)]/50 px-3 py-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">
        {supplier}
      </span>
      <span className="text-xs text-[var(--muted-foreground)]">
        {count} produto{count !== 1 ? "s" : ""}
      </span>
    </div>
  );
}
