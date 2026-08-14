import type {
  InventoryRow,
  InventorySortKey,
} from "@/components/inventory/inventory-stock-table/types";

export const MAX_LEAD_DAYS = 365;

export function getInventorySortValue(
  row: InventoryRow,
  key: InventorySortKey,
): number {
  switch (key) {
    case "warehouseStock":
      return stockUnits(row.warehouseStock);
    case "mlStock":
      return stockUnits(row.mlStock);
    case "onTheWay":
      return onTheWayUnits(row);
    case "totalStock":
      return (
        stockUnits(row.warehouseStock) +
        stockUnits(row.mlStock) +
        onTheWayUnits(row)
      );
    case "leadTimeDays":
      return row.leadTimeDays ?? Number.POSITIVE_INFINITY;
    case "needsPurchaseAttention":
      return row.needsPurchaseAttention ? 1 : 0;
  }
}

export function stockUnits(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

export function onTheWayUnits(row: InventoryRow): number {
  const legacy = (row as InventoryRow & { mlStockInProcess?: number })
    .mlStockInProcess;
  return stockUnits(row.mlStockOnTheWay ?? legacy);
}

export function formatLeadTimeDisplay(days: number | null): string {
  if (days === null) return "—";
  if (days === 0) return "0 d";
  if (days % 7 === 0) return `${days / 7} sem.`;
  return `${days} d`;
}

export function leadTimeToForm(days: number | null): {
  value: string;
  unit: "weeks" | "days";
} {
  if (days === null || days === 0) return { value: "", unit: "weeks" };
  if (days % 7 === 0) return { value: String(days / 7), unit: "weeks" };
  return { value: String(days), unit: "days" };
}

export function formatOnTheWayCell(row: InventoryRow): {
  display: string;
  muted: boolean;
  showTooltip: boolean;
  cellTooltip: React.ReactNode | null;
} {
  if (!row.isFulfillment) {
    return {
      display: "—",
      muted: true,
      showTooltip: false,
      cellTooltip: null,
    };
  }

  const onTheWay = onTheWayUnits(row);
  const transfer = stockUnits(row.mlProcessTransfer);
  const internal = stockUnits(row.mlProcessInternal);

  const parts: string[] = [];
  if (transfer > 0) {
    parts.push(`Em transferência: ${transfer}`);
  }
  if (internal > 0) {
    parts.push(`Processamento interno: ${internal}`);
  }

  if (onTheWay === 0) {
    return {
      display: "0",
      muted: false,
      showTooltip: true,
      cellTooltip: (
        <>
          <p>
            Nenhuma unidade em transferência ou processamento interno na API.
          </p>
          <p className="mt-2">
            Pode haver entrada pendente no painel do Meli que não aparece aqui.
          </p>
        </>
      ),
    };
  }

  return {
    display: String(onTheWay),
    muted: false,
    showTooltip: true,
    cellTooltip: (
      <>
        {parts.length > 0 ? <p>{parts.join(" · ")}</p> : null}
        <p className={parts.length > 0 ? "mt-2" : undefined}></p>
      </>
    ),
  };
}
