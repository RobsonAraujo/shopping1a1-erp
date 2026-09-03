import { getListingStatusDisplay } from "@/lib/mercadolibre/listing-status";
import { Badge } from "@/components/ui/badge";

type ListingStatusBadgeProps = {
  status: string;
  mlStock: number;
  warehouseStock?: number;
};

export function ListingStatusBadge({
  status,
  mlStock,
  warehouseStock = 0,
}: ListingStatusBadgeProps) {
  const display = getListingStatusDisplay(status, mlStock, warehouseStock);
  if (!display.showBadge) return null;

  return (
    <Badge
      className="mt-0.5 h-4 max-w-full truncate border-amber-200/80 bg-amber-50 px-1.5 text-[10px] font-normal text-amber-950"
      title={display.hint}
    >
      {display.label}
    </Badge>
  );
}

export function listingRowMutedClass(
  status: string,
  mlStock: number,
  warehouseStock = 0,
): string | undefined {
  return getListingStatusDisplay(status, mlStock, warehouseStock).rowMuted
    ? "bg-[var(--muted)]/25"
    : undefined;
}
