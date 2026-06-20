"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { HelpCircle, ImageOff, Pencil, Settings } from "lucide-react";
import {
  ListingStatusBadge,
  listingRowMutedClass,
} from "@/components/listing-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormSelect } from "@/components/ui/form-select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ItemListSearch,
  itemListSearchEmptyMessage,
} from "@/components/item-list-search";
import { groupBySkuSupplier } from "@/lib/mercadolibre/item-sku";
import { filterByItemListSearch } from "@/lib/item-list-search";
import type { StockReportProductInfo } from "@/lib/inventory-stock-report";
import { InventoryStockReportLauncher } from "@/components/inventory-stock-report-dialog";
import { cn } from "@/lib/utils";

const MAX_LEAD_DAYS = 365;

function stockUnits(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function onTheWayUnits(row: InventoryRow): number {
  const legacy = (row as InventoryRow & { mlStockInProcess?: number })
    .mlStockInProcess;
  return stockUnits(row.mlStockOnTheWay ?? legacy);
}

export type InventoryRow = {
  mlItemId: string;
  sku: string | null;
  title: string;
  imageUrl?: string;
  mlStatus: string;
  mlStock: number;
  warehouseStock: number;
  isFulfillment: boolean;
  mlStockOnTheWay: number;
  mlProcessTransfer: number;
  mlProcessInternal: number;
  leadTimeDays: number | null;
  needsPurchaseAttention: boolean;
};

type InventoryStockTableProps = {
  rows: InventoryRow[];
  productsBySku: Record<string, StockReportProductInfo>;
};

function formatLeadTimeDisplay(days: number | null): string {
  if (days === null) return "—";
  if (days === 0) return "0 d";
  if (days % 7 === 0) return `${days / 7} sem.`;
  return `${days} d`;
}

function leadTimeToForm(days: number | null): {
  value: string;
  unit: "weeks" | "days";
} {
  if (days === null || days === 0) return { value: "", unit: "weeks" };
  if (days % 7 === 0) return { value: String(days / 7), unit: "weeks" };
  return { value: String(days), unit: "days" };
}

function StockColumnHeader({
  label,
  tooltip,
  ariaLabel,
}: {
  label: string;
  tooltip: React.ReactNode;
  ariaLabel: string;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex cursor-pointer rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            aria-label={ariaLabel}
          >
            <HelpCircle className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </span>
  );
}

function formatOnTheWayCell(row: InventoryRow): {
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

export function InventoryStockTable({
  rows,
  productsBySku,
}: InventoryStockTableProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const filteredRows = useMemo(
    () =>
      filterByItemListSearch(rows, searchQuery, (row) => ({
        sku: row.sku,
        title: row.title,
        mlItemId: row.mlItemId,
      })),
    [rows, searchQuery],
  );
  const editing = editId
    ? (rows.find((r) => r.mlItemId === editId) ?? null)
    : null;
  const settingsRow = settingsId
    ? (rows.find((r) => r.mlItemId === settingsId) ?? null)
    : null;
  const supplierGroups = useMemo(
    () => groupBySkuSupplier(filteredRows, (row) => row.sku),
    [filteredRows],
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <InventoryStockReportLauncher
            rows={rows}
            productsBySku={productsBySku}
          />
        </div>
        <ItemListSearch
          value={searchQuery}
          onChange={setSearchQuery}
          filteredCount={filteredRows.length}
          totalCount={rows.length}
        />
        <Card className="overflow-hidden p-0 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[60rem] text-left text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--muted)]/80">
                <tr>
                  <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                    Produto
                  </th>
                  <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                    <StockColumnHeader
                      label="Galpão"
                      ariaLabel="Informação sobre estoque no galpão"
                      tooltip="Unidades no nosso galpão, ainda não enviadas ao Mercado Livre."
                    />
                  </th>
                  <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                    <StockColumnHeader
                      label="Já no Full"
                      ariaLabel="Informação sobre estoque já no Full"
                      tooltip="Unidades que já entraram no depósito Full do Mercado Livre e estão disponíveis para venda no anúncio."
                    />
                  </th>
                  <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                    <StockColumnHeader
                      label="A caminho"
                      ariaLabel="Informação sobre estoque a caminho do Full"
                      tooltip={
                        <>
                          <p>
                            Unidades enviadas ao Full que ainda não estão
                            vendáveis. O número reflete o que a API do Mercado
                            Livre informa: <strong>em transferência</strong> e{" "}
                            <strong>processamento interno</strong>.
                          </p>
                          <p className="mt-2">
                            A <strong>entrada pendente</strong> (envio agendado
                            que ainda não entrou no inventário do ML) aparece no
                            painel do Meli, mas{" "}
                            <strong>não é exposta pela API</strong>— por isso
                            pode ser menor que o &quot;A caminho&quot; do Seller
                            Center.
                          </p>
                        </>
                      }
                    />
                  </th>
                  <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                    <StockColumnHeader
                      label="Total"
                      ariaLabel="Informação sobre estoque total"
                      tooltip="Soma de todas as unidades sob nosso controle: galpão + já no Full + a caminho (via API). Pode ser menor que o total do painel Meli quando há entrada pendente."
                    />
                  </th>
                  <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                    <span className="inline-flex items-center gap-1">
                      Prazo compra
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex cursor-pointer rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                            aria-label="Informação sobre prazo de compra"
                          >
                            <HelpCircle className="size-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          Tempo entre decidir comprar e o produto chegar no
                          galpão. Usado para planejamento futuro.
                        </TooltipContent>
                      </Tooltip>
                    </span>
                  </th>
                  <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-12 text-center text-[var(--muted-foreground)]"
                    >
                      {rows.length === 0
                        ? "Nenhum anúncio nesta página."
                        : itemListSearchEmptyMessage(searchQuery)}
                    </td>
                  </tr>
                ) : (
                  supplierGroups.map((group) => (
                    <Fragment key={group.supplier}>
                      <tr className="border-b border-[var(--border)] bg-[var(--muted)]/50">
                        <td colSpan={7} className="px-4 py-2.5">
                          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">
                            {group.supplier}
                          </span>
                          <span className="ml-2 text-xs font-normal normal-case text-[var(--muted-foreground)]">
                            {group.rows.length} produto
                            {group.rows.length !== 1 ? "s" : ""}
                          </span>
                        </td>
                      </tr>
                      {group.rows.map((row) => {
                        const total =
                          stockUnits(row.warehouseStock) +
                          stockUnits(row.mlStock) +
                          onTheWayUnits(row);
                        const onTheWayCell = formatOnTheWayCell(row);
                        return (
                          <tr
                            key={row.mlItemId}
                            className={cn(
                              "border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--muted)]/40",
                              listingRowMutedClass(
                                row.mlStatus,
                                row.mlStock,
                                row.warehouseStock,
                              ),
                            )}
                          >
                            <td className="align-middle px-4 py-3.5">
                              <div className="flex gap-3">
                                <span
                                  className="relative shrink-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--muted)]"
                                  aria-hidden
                                >
                                  {row.imageUrl ? (
                                    <Image
                                      src={row.imageUrl}
                                      alt=""
                                      width={128}
                                      height={128}
                                      className="size-12 object-contain sm:size-14"
                                      sizes="56px"
                                    />
                                  ) : (
                                    <span className="flex size-12 items-center justify-center sm:size-14">
                                      <ImageOff
                                        className="size-5 text-[var(--muted-foreground)]/60"
                                        aria-hidden
                                      />
                                    </span>
                                  )}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="flex items-center gap-2">
                                    <span
                                      className="block truncate font-semibold leading-snug text-[var(--foreground)]"
                                      title={row.title}
                                    >
                                      {row.sku ?? "Sem SKU"}
                                    </span>
                                    {row.needsPurchaseAttention ? (
                                      <Badge
                                        variant="warning"
                                        className="h-5 px-1.5 text-[10px]"
                                      >
                                        Comprar
                                      </Badge>
                                    ) : null}
                                  </span>
                                  <span
                                    className="mt-0.5 block text-xs leading-snug text-[var(--muted-foreground)]"
                                    title={row.title}
                                  >
                                    {row.title}
                                  </span>
                                  <ListingStatusBadge
                                    status={row.mlStatus}
                                    mlStock={row.mlStock}
                                    warehouseStock={row.warehouseStock}
                                  />
                                </span>
                              </div>
                            </td>
                            <td className="align-middle px-4 py-3.5 tabular-nums">
                              {stockUnits(row.warehouseStock)}
                            </td>
                            <td className="align-middle px-4 py-3.5 tabular-nums">
                              {stockUnits(row.mlStock)}
                            </td>
                            <td
                              className={cn(
                                "align-middle px-4 py-3.5 tabular-nums",
                                onTheWayCell.muted &&
                                  "text-[var(--muted-foreground)]",
                              )}
                            >
                              {onTheWayCell.showTooltip ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="cursor-help underline decoration-dotted decoration-[var(--muted-foreground)]/50 underline-offset-2">
                                      {onTheWayCell.display}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent
                                    side="top"
                                    className="max-w-xs"
                                  >
                                    {onTheWayCell.cellTooltip}
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                onTheWayCell.display
                              )}
                            </td>
                            <td className="align-middle px-4 py-3.5 tabular-nums font-medium">
                              {total}
                            </td>
                            <td className="align-middle px-4 py-3.5 tabular-nums text-[var(--muted-foreground)]">
                              {formatLeadTimeDisplay(row.leadTimeDays)}
                            </td>
                            <td className="align-middle px-4 py-3.5">
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon-sm"
                                  className="shrink-0"
                                  title="Configurações do anúncio"
                                  aria-label="Configurações do anúncio"
                                  onClick={() => setSettingsId(row.mlItemId)}
                                >
                                  <Settings className="size-4" aria-hidden />
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="gap-1.5"
                                  onClick={() => setEditId(row.mlItemId)}
                                >
                                  <Pencil className="size-3.5" aria-hidden />
                                  Editar
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {editing ? (
          <WarehouseEditModal
            row={editing}
            onClose={() => setEditId(null)}
            onSaved={() => {
              setEditId(null);
              router.refresh();
            }}
          />
        ) : null}

        {settingsRow ? (
          <LeadTimeSettingsModal
            key={settingsRow.mlItemId}
            row={settingsRow}
            onClose={() => setSettingsId(null)}
            onSaved={() => {
              setSettingsId(null);
              router.refresh();
            }}
          />
        ) : null}
      </div>
    </TooltipProvider>
  );
}

function WarehouseEditModal({
  row,
  onClose,
  onSaved,
}: {
  row: InventoryRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const labelId = useId();
  const descId = useId();
  const [value, setValue] = useState(String(row.warehouseStock));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit() {
    const n = parseInt(value, 10);
    if (!Number.isInteger(n) || n < 0) {
      setError("Informe um número inteiro maior ou igual a zero.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(
        `/api/inventory/${encodeURIComponent(row.mlItemId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quantity: n }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Não foi possível salvar.");
        return;
      }
      onSaved();
    } catch {
      setError("Falha de rede. Tente de novo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
      onClick={handleBackdrop}
    >
      <div className="fixed inset-0 bg-black/50" aria-hidden />
      <div
        className={cn(
          "relative z-10 w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-lg",
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        aria-describedby={descId}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id={labelId}
          className="text-lg font-semibold text-[var(--primary)]"
        >
          Estoque no galpão
        </h2>
        <p
          id={descId}
          className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]"
        >
          Ajuste apenas a quantidade física no galpão. O estoque no Mercado
          Livre vem da API do ML e não é alterado aqui.
        </p>
        <div className="mt-3">
          <p className="text-sm font-semibold text-[var(--foreground)]">
            {row.sku ?? "Sem SKU"}
          </p>
          <p
            className="text-xs text-[var(--muted-foreground)] line-clamp-2"
            title={row.title}
          >
            {row.title}
          </p>
        </div>

        <label
          htmlFor="warehouse-qty"
          className="mt-4 block text-sm font-medium text-[var(--foreground)]"
        >
          Quantidade no galpão
        </label>
        <input
          id="warehouse-qty"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm tabular-nums text-[var(--foreground)] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        />

        {error ? (
          <p className="mt-2 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={saving}>
            {saving ? "Salvando…" : "Confirmar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function LeadTimeSettingsModal({
  row,
  onClose,
  onSaved,
}: {
  row: InventoryRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const labelId = useId();
  const descId = useId();
  const initial = leadTimeToForm(row.leadTimeDays);
  const [value, setValue] = useState(initial.value);
  const [unit, setUnit] = useState<"weeks" | "days">(initial.unit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const i = leadTimeToForm(row.leadTimeDays);
    setValue(i.value);
    setUnit(i.unit);
  }, [row.mlItemId, row.leadTimeDays]);

  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit() {
    const trimmed = value.trim();
    let purchaseLeadTimeDays: number | null;
    if (trimmed === "") {
      purchaseLeadTimeDays = null;
    } else {
      const n = parseInt(trimmed, 10);
      if (!Number.isInteger(n) || n < 0) {
        setError("Informe um número inteiro maior ou igual a zero.");
        return;
      }
      const days = unit === "weeks" ? n * 7 : n;
      if (days > MAX_LEAD_DAYS) {
        setError(`O prazo total não pode passar de ${MAX_LEAD_DAYS} dias.`);
        return;
      }
      purchaseLeadTimeDays = days;
    }

    setError(null);
    setSaving(true);
    try {
      const res = await fetch(
        `/api/inventory/${encodeURIComponent(row.mlItemId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quantity: row.warehouseStock,
            purchaseLeadTimeDays,
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Não foi possível salvar.");
        return;
      }
      onSaved();
    } catch {
      setError("Falha de rede. Tente de novo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
      onClick={handleBackdrop}
    >
      <div className="fixed inset-0 bg-black/50" aria-hidden />
      <div
        className={cn(
          "relative z-10 w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-lg",
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        aria-describedby={descId}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id={labelId}
          className="text-lg font-semibold text-[var(--primary)]"
        >
          Configurações do anúncio
        </h2>
        <p
          id={descId}
          className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]"
        >
          Ajuste o tempo entre decidir a compra e o produto chegar no galpão.
        </p>
        <div className="mt-3">
          <p className="text-sm font-semibold text-[var(--foreground)]">
            {row.sku ?? "Sem SKU"}
          </p>
          <p
            className="text-xs text-[var(--muted-foreground)] line-clamp-2"
            title={row.title}
          >
            {row.title}
          </p>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2">
            <label
              htmlFor="lead-time-value"
              className="text-sm font-medium text-[var(--foreground)]"
            >
              Prazo até o galpão
            </label>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex cursor-pointer rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  aria-label="O que é este prazo?"
                >
                  <HelpCircle className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                Tempo desde que você decide comprar até a mercadoria chegar no
                galpão. O valor é salvo em dias (se escolher semanas,
                convertemos automaticamente).
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              id="lead-time-value"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              placeholder="Ex.: 2"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm tabular-nums text-[var(--foreground)] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            />
            <FormSelect
              id="lead-time-unit"
              aria-label="Unidade do prazo"
              value={unit}
              onValueChange={(value) =>
                setUnit(value === "weeks" ? "weeks" : "days")
              }
              options={[
                { value: "weeks", label: "Semanas" },
                { value: "days", label: "Dias" },
              ]}
              triggerClassName="w-[8.5rem]"
            />
          </div>
          <p className="text-xs text-[var(--muted-foreground)]">
            Informe em semanas ou em dias; o sistema grava em dias para cálculos
            futuros. Deixe em branco para remover o prazo.
          </p>
        </div>

        {error ? (
          <p className="mt-2 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={saving}>
            {saving ? "Salvando…" : "Confirmar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
