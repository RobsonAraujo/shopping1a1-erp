"use client";

import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { TableSort } from "@/components/ui/sortable-th";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useTableSort } from "@/hooks/use-table-sort";
import {
  formatFinancialMoney,
  formatFinancialPercent,
  percentOfSale,
} from "@/lib/pricing/financial-margin";
import type { DetalhamentoTributario } from "@/lib/tax-report/types";
import { icmsSemDifal } from "@/lib/tax-report/calculators/icms-difal";
import { impostoOperacionalLinha, margemOperacionalEstimadaLinha } from "@/lib/tax-report/imposto-operacional";
import { TaxReportCalculationPanel } from "@/components/relatorio-tributario/TaxReportCalculationPanel";
import { cn } from "@/lib/utils";

type TransactionSortKey =
  | "sku"
  | "data"
  | "uf"
  | "doc"
  | "qtd"
  | "receita"
  | "pisCofins"
  | "icms"
  | "difal"
  | "impostoOperacional"
  | "margemOperacional";

function getTransactionSortValue(
  row: DetalhamentoTributario,
  key: TransactionSortKey,
): string | number {
  const t = row.transacao;
  switch (key) {
    case "sku":
      return t.sku ?? "";
    case "data":
      return new Date(t.orderDate).getTime();
    case "uf":
      return t.ufDestino ?? "";
    case "doc":
      return t.tipoDocumento ?? "";
    case "qtd":
      return t.quantidade;
    case "receita":
      return t.receitaBruta;
    case "pisCofins":
      return row.pisCofins?.liquido ?? Number.NEGATIVE_INFINITY;
    case "icms":
      return row.incluidoNaApuracao ? (icmsSemDifal(row.icmsDifal) ?? Number.NEGATIVE_INFINITY) : Number.NEGATIVE_INFINITY;
    case "difal":
      return row.icmsDifal?.difal ?? Number.NEGATIVE_INFINITY;
    case "impostoOperacional":
      return impostoOperacionalLinha(row) ?? Number.NEGATIVE_INFINITY;
    case "margemOperacional":
      return row.incluidoNaApuracao
        ? (margemOperacionalEstimadaLinha(row) ?? Number.NEGATIVE_INFINITY)
        : Number.NEGATIVE_INFINITY;
  }
}

function SortTrigger({
  label,
  sortKey,
  sort,
  onSortChange,
  align = "right",
}: {
  label: ReactNode;
  sortKey: TransactionSortKey;
  sort: TableSort<TransactionSortKey>;
  onSortChange: (key: TransactionSortKey) => void;
  align?: "left" | "right";
}) {
  const active = sort.key === sortKey;
  const Icon = active ? (sort.direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={() => onSortChange(sortKey)}
      className={cn(
        "inline-flex w-full cursor-pointer items-center gap-1 hover:text-[var(--foreground)]",
        align === "right" && "flex-row-reverse",
        active && "text-[var(--foreground)]",
      )}
    >
      {label}
      <Icon className="size-3 shrink-0" />
    </button>
  );
}

const ROW_HEIGHT = 52;
const MOBILE_CARD_HEIGHT = 128;

/** 10 colunas — cabe em max-w-7xl sem scroll horizontal. */
const GRID_COLS_DETAIL =
  "5rem 3.25rem minmax(4.25rem,0.55fr) minmax(4rem,0.5fr) minmax(4.5rem,1fr) minmax(4.5rem,1fr) minmax(4rem,1fr) minmax(3.75rem,1fr) minmax(4.5rem,1fr) minmax(4.25rem,1fr)";

const GRID_COLS_WITH_ORDER_SKU =
  "5rem minmax(5rem,1fr) 3.25rem minmax(4.25rem,0.55fr) minmax(4rem,0.5fr) minmax(4.5rem,1fr) minmax(4.5rem,1fr) minmax(4rem,1fr) minmax(3.75rem,1fr) minmax(4.5rem,1fr) minmax(4.25rem,1fr)";

const GRID_COLS_WITH_SKU =
  "5rem minmax(4rem,1fr) 3.25rem minmax(4.25rem,0.55fr) minmax(4rem,0.5fr) minmax(4.5rem,1fr) minmax(4.5rem,1fr) minmax(4rem,1fr) minmax(3.75rem,1fr) minmax(4.5rem,1fr) minmax(4.25rem,1fr)";

function tableGridStyle(options: {
  showSku?: boolean;
  showOrderSku?: boolean;
}): CSSProperties {
  if (options.showOrderSku) {
    return { gridTemplateColumns: GRID_COLS_WITH_ORDER_SKU };
  }
  return {
    gridTemplateColumns: options.showSku ? GRID_COLS_WITH_SKU : GRID_COLS_DETAIL,
  };
}

/**
 * Largura mínima da tabela = soma dos mínimos de cada coluna do grid. Sem
 * isso, em telas estreitas o `minmax(...)` comprime as colunas até ficarem
 * ilegíveis em vez de permitir rolagem horizontal.
 */
function tableMinWidth(options: { showSku?: boolean; showOrderSku?: boolean }): string {
  if (options.showOrderSku) return "47rem";
  return options.showSku ? "46rem" : "42rem";
}

const TABLE_ROW_CLASS =
  "grid w-full items-center border-b border-[var(--border)]";

export function TaxReportHeaderWithTip({
  label,
  tip,
  align = "right",
}: {
  label: string;
  tip: string;
  align?: "left" | "right" | "center";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap",
        align === "right" && "justify-end",
        align === "center" && "justify-center",
      )}
    >
      {label}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="relative z-10 shrink-0 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            aria-label={`Sobre ${label}`}
            onClick={(e) => e.stopPropagation()}
          >
            <Info className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-sm text-left text-xs">
          {tip}
        </TooltipContent>
      </Tooltip>
    </span>
  );
}

function TransactionTableHeader({
  showSku,
  showOrderSku,
  sort,
  onSortChange,
}: {
  showSku?: boolean;
  showOrderSku?: boolean;
  sort: TableSort<TransactionSortKey>;
  onSortChange: (key: TransactionSortKey) => void;
}) {
  return (
    <div
      className="grid w-full items-center border-b border-[var(--border)] bg-[var(--background)] text-left text-xs text-[var(--muted-foreground)]"
      style={tableGridStyle({ showSku, showOrderSku })}
    >
      <span className="min-w-0 px-2 py-2.5 whitespace-nowrap">
        <SortTrigger label="Data" sortKey="data" sort={sort} onSortChange={onSortChange} align="left" />
      </span>
      {showOrderSku ? (
        <span className="min-w-0 truncate px-2 py-2.5">
          <SortTrigger
            label={
              <TaxReportHeaderWithTip
                label="SKU no pedido"
                tip="Nome do SKU registrado no pedido do Mercado Livre. Pode diferir do cadastro atual quando o SKU foi renomeado."
                align="left"
              />
            }
            sortKey="sku"
            sort={sort}
            onSortChange={onSortChange}
            align="left"
          />
        </span>
      ) : null}
      {showSku ? (
        <span className="min-w-0 truncate px-2 py-2.5">
          <SortTrigger label="SKU" sortKey="sku" sort={sort} onSortChange={onSortChange} align="left" />
        </span>
      ) : null}
      <span className="min-w-0 py-2.5 pr-4 pl-2 whitespace-nowrap">
        <SortTrigger label="UF" sortKey="uf" sort={sort} onSortChange={onSortChange} align="left" />
      </span>
      <span className="min-w-0 truncate py-2.5 pr-2 pl-4">
        <SortTrigger label="Doc." sortKey="doc" sort={sort} onSortChange={onSortChange} align="left" />
      </span>
      <span className="min-w-0 px-2 py-2.5 text-right">
        <SortTrigger
          label={
            <TaxReportHeaderWithTip
              label="Qtd"
              tip="Unidades vendidas nesta linha do pedido."
              align="right"
            />
          }
          sortKey="qtd"
          sort={sort}
          onSortChange={onSortChange}
        />
      </span>
      <span className="px-2 py-2.5 text-right whitespace-nowrap">
        <SortTrigger label="Receita" sortKey="receita" sort={sort} onSortChange={onSortChange} />
      </span>
      <span className="px-2 py-2.5 text-right whitespace-nowrap">
        <SortTrigger
          label={
            <TaxReportHeaderWithTip
              label="PIS/COFINS"
              tip="Líquido após crédito na NF de entrada. Passe o mouse no valor da linha para ver débito e crédito."
            />
          }
          sortKey="pisCofins"
          sort={sort}
          onSortChange={onSortChange}
        />
      </span>
      <span className="px-2 py-2.5 text-right whitespace-nowrap">
        <SortTrigger
          label={
            <TaxReportHeaderWithTip
              label="ICMS"
              tip="ICMS interno ou interestadual (UF origem) — sem DIFAL."
            />
          }
          sortKey="icms"
          sort={sort}
          onSortChange={onSortChange}
        />
      </span>
      <span className="px-2 py-2.5 text-right whitespace-nowrap">
        <SortTrigger
          label={
            <TaxReportHeaderWithTip
              label="DIFAL"
              tip="Diferencial de alíquota (EC 87/2015) para comprador não contribuinte."
            />
          }
          sortKey="difal"
          sort={sort}
          onSortChange={onSortChange}
        />
      </span>
      <span className="px-2 py-2.5 text-right whitespace-nowrap">
        <SortTrigger
          label={
            <TaxReportHeaderWithTip
              label="Imp. oper."
              tip="PIS/COFINS + ICMS por venda. Percentual sobre a receita bruta."
            />
          }
          sortKey="impostoOperacional"
          sort={sort}
          onSortChange={onSortChange}
        />
      </span>
      <span className="px-2 py-2.5 text-right whitespace-nowrap">
        <SortTrigger
          label={
            <TaxReportHeaderWithTip
              label="Margem oper."
              tip="Receita menos CMV e impostos operacionais nesta venda."
            />
          }
          sortKey="margemOperacional"
          sort={sort}
          onSortChange={onSortChange}
        />
      </span>
    </div>
  );
}

function TransactionRowCells({
  row,
  showSku,
  showOrderSku,
  canonicalSku,
}: {
  row: DetalhamentoTributario;
  showSku?: boolean;
  showOrderSku?: boolean;
  canonicalSku?: string;
}) {
  const t = row.transacao;
  const impostoOperacional = impostoOperacionalLinha(row);
  const impostoOperacionalPercent =
    impostoOperacional != null
      ? percentOfSale(impostoOperacional, t.receitaBruta)
      : null;
  const margemOperacional = margemOperacionalEstimadaLinha(row);
  const margemPercent = row.incluidoNaApuracao
    ? percentOfSale(margemOperacional, t.receitaBruta)
    : null;

  return (
    <>
      <span className="px-2 text-xs whitespace-nowrap">
        {t.orderDate.slice(0, 10)}
      </span>
      {showOrderSku ? (
        <span className="min-w-0 truncate px-2 text-xs" title={t.sku}>
          <span className="font-medium">{t.sku}</span>
          {canonicalSku && t.sku !== canonicalSku ? (
            <span className="mt-0.5 block text-[10px] text-[var(--muted-foreground)]">
              → {canonicalSku}
            </span>
          ) : null}
        </span>
      ) : null}
      {showSku ? (
        <span className="truncate px-2 font-medium" title={t.sku}>
          {t.sku}
        </span>
      ) : null}
      <span className="min-w-0 truncate py-2.5 pr-4 pl-2 whitespace-nowrap">{t.ufDestino ?? "—"}</span>
      <span className="min-w-0 truncate py-2.5 pr-2 pl-4 whitespace-nowrap">
        {t.tipoDocumento}
        {t.tipoDocumento === "CNPJ" && t.contribuinteIcms !== null ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "ml-1.5 inline-block size-1.5 rounded-full align-middle",
                  t.contribuinteIcms ? "bg-emerald-500" : "bg-[var(--muted-foreground)]",
                )}
                aria-label={
                  t.contribuinteIcms ? "Contribuinte ICMS" : "Não contribuinte ICMS"
                }
              />
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {t.contribuinteIcms ? "Contribuinte ICMS" : "Não contribuinte ICMS"}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </span>
      <span className="min-w-0 px-2 text-right tabular-nums whitespace-nowrap">
        {t.quantidade}
      </span>
      <span className="px-2 text-right tabular-nums whitespace-nowrap">
        {formatFinancialMoney(t.receitaBruta)}
      </span>
      <span className="px-2 text-right tabular-nums whitespace-nowrap">
        {row.incluidoNaApuracao && row.pisCofins ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center justify-end gap-1">
                {!t.unitCostNf ? (
                  <AlertTriangle
                    className="size-3 shrink-0 text-amber-600"
                    aria-label="Sem custo NF cadastrado"
                  />
                ) : null}
                {formatFinancialMoney(row.pisCofins.liquido)}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-left text-xs">
              <p>Débito: {formatFinancialMoney(row.pisCofins.debitoTotal)}</p>
              <p>Crédito: {formatFinancialMoney(row.pisCofins.creditoTotal)}</p>
              <p>Líquido: {formatFinancialMoney(row.pisCofins.liquido)}</p>
              {!t.unitCostNf ? (
                <p className="mt-1 text-amber-700">
                  Sem custo NF — crédito zerado nesta linha.
                </p>
              ) : null}
            </TooltipContent>
          </Tooltip>
        ) : (
          formatFinancialMoney(row.pisCofins?.liquido ?? null)
        )}
      </span>
      <span className="px-2 text-right tabular-nums whitespace-nowrap">
        {formatFinancialMoney(
          row.incluidoNaApuracao ? icmsSemDifal(row.icmsDifal) : null,
        )}
      </span>
      <span className="px-2 text-right tabular-nums whitespace-nowrap">
        {formatFinancialMoney(row.icmsDifal?.difal ?? null)}
      </span>
      <span className="flex flex-col items-end px-2 text-right tabular-nums">
        <span className="whitespace-nowrap">
          {formatFinancialPercent(impostoOperacionalPercent)}
        </span>
        <span className="text-[10px] text-[var(--muted-foreground)]">
          {formatFinancialMoney(impostoOperacional)}
        </span>
      </span>
      <span className="flex flex-col items-end px-2 text-right tabular-nums">
        <span className="whitespace-nowrap">
          {formatFinancialPercent(margemPercent)}
        </span>
        <span className="text-[10px] text-[var(--muted-foreground)]">
          {formatFinancialMoney(row.incluidoNaApuracao ? margemOperacional : null)}
        </span>
      </span>
    </>
  );
}

function TransactionCard({
  row,
  isSelected,
  canonicalSku,
  onClick,
}: {
  row: DetalhamentoTributario;
  isSelected: boolean;
  canonicalSku?: string;
  onClick: () => void;
}) {
  const t = row.transacao;
  const impostoOperacional = impostoOperacionalLinha(row);
  const impostoOperacionalPercent =
    impostoOperacional != null
      ? percentOfSale(impostoOperacional, t.receitaBruta)
      : null;
  const margemOperacional = margemOperacionalEstimadaLinha(row);
  const margemPercent = row.incluidoNaApuracao
    ? percentOfSale(margemOperacional, t.receitaBruta)
    : null;

  return (
    <button
      type="button"
      role="row"
      aria-selected={isSelected}
      onClick={onClick}
      className={cn(
        "w-full space-y-2 rounded-lg border border-[var(--border)] p-3 text-left transition-colors",
        !row.incluidoNaApuracao && "bg-amber-50/50",
        isSelected && "border-[var(--primary)]/40 bg-[var(--primary)]/10",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-xs text-[var(--muted-foreground)]">
          <span className="whitespace-nowrap">{t.orderDate.slice(0, 10)}</span>
          <span className="whitespace-nowrap">· {t.ufDestino ?? "—"}</span>
          <span className="whitespace-nowrap">
            · {t.tipoDocumento}
            {t.tipoDocumento === "CNPJ" && t.contribuinteIcms !== null ? (
              <span
                className={cn(
                  "ml-1 inline-block size-1.5 rounded-full align-middle",
                  t.contribuinteIcms ? "bg-emerald-500" : "bg-[var(--muted-foreground)]",
                )}
                aria-hidden
              />
            ) : null}
          </span>
        </div>
        <ChevronRight
          className={cn(
            "size-4 shrink-0 text-[var(--muted-foreground)] transition-transform",
            isSelected && "rotate-90",
          )}
          aria-hidden
        />
      </div>

      {t.sku ? (
        <p className="truncate text-xs font-medium text-[var(--foreground)]">
          {t.sku}
          {canonicalSku && t.sku !== canonicalSku ? (
            <span className="ml-1 text-[10px] font-normal text-[var(--muted-foreground)]">
              → {canonicalSku}
            </span>
          ) : null}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold tabular-nums">
          {formatFinancialMoney(t.receitaBruta)}
        </span>
        <span className="text-xs tabular-nums text-[var(--muted-foreground)]">
          {t.quantidade} un.
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-[var(--border)] pt-2 text-xs">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
            Imp. oper.
          </p>
          <p className="tabular-nums">
            {formatFinancialPercent(impostoOperacionalPercent)}{" "}
            <span className="text-[var(--muted-foreground)]">
              ({formatFinancialMoney(impostoOperacional)})
            </span>
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
            Margem oper.
          </p>
          <p className="tabular-nums">
            {formatFinancialPercent(margemPercent)}{" "}
            <span className="text-[var(--muted-foreground)]">
              ({formatFinancialMoney(row.incluidoNaApuracao ? margemOperacional : null)})
            </span>
          </p>
        </div>
      </div>

      {!t.unitCostNf ? (
        <p className="flex items-center gap-1 text-[10px] text-amber-700">
          <AlertTriangle className="size-3 shrink-0" aria-hidden />
          Sem custo NF cadastrado — crédito PIS/COFINS zerado nesta linha.
        </p>
      ) : null}
    </button>
  );
}

export function VirtualizedTaxReportTransactionTable({
  rows,
  showSku = false,
  showOrderSku = false,
  canonicalSku,
}: {
  rows: DetalhamentoTributario[];
  showSku?: boolean;
  showOrderSku?: boolean;
  canonicalSku?: string;
}) {
  const isMobile = useIsMobile();
  const parentRef = useRef<HTMLDivElement>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const { sort, sortedRows, onSortChange } = useTableSort<
    DetalhamentoTributario,
    TransactionSortKey
  >(rows, getTransactionSortValue, { key: "data", direction: "desc" });

  const rowVirtualizer = useVirtualizer({
    count: sortedRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => (isMobile ? MOBILE_CARD_HEIGHT : ROW_HEIGHT),
    overscan: 8,
  });

  const selectedRow =
    selectedKey != null
      ? (sortedRows.find((row) => row.transacao.transactionKey === selectedKey) ??
        null)
      : null;

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">
        Nenhuma venda encontrada para os filtros aplicados.
      </p>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        {isMobile ? (
          <div
            ref={parentRef}
            className="max-h-[36rem] overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--muted)]/10 p-2"
          >
            <div
              className="w-full"
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                position: "relative",
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const row = sortedRows[virtualRow.index];
                const isSelected =
                  selectedKey === row.transacao.transactionKey;
                return (
                  <div
                    key={row.transacao.transactionKey}
                    ref={rowVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    className="absolute left-0 top-0 w-full px-1 pb-2"
                    style={{
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <TransactionCard
                      row={row}
                      isSelected={isSelected}
                      canonicalSku={canonicalSku}
                      onClick={() =>
                        setSelectedKey(
                          isSelected ? null : row.transacao.transactionKey,
                        )
                      }
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div
            className="overflow-x-auto rounded-lg border border-[var(--border)] text-sm"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <div style={{ minWidth: tableMinWidth({ showSku, showOrderSku }) }}>
              <TransactionTableHeader showSku={showSku} showOrderSku={showOrderSku} sort={sort} onSortChange={onSortChange} />
              <div
                ref={parentRef}
                className="max-h-[32rem] overflow-x-hidden overflow-y-auto"
              >
                <div
                  className="w-full"
                  style={{
                    height: `${rowVirtualizer.getTotalSize()}px`,
                    position: "relative",
                  }}
                >
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const row = sortedRows[virtualRow.index];
                    const isSelected =
                      selectedKey === row.transacao.transactionKey;
                    return (
                      <div
                        key={row.transacao.transactionKey}
                        role="row"
                        aria-selected={isSelected}
                        className={cn(
                          TABLE_ROW_CLASS,
                          "absolute left-0 cursor-pointer hover:bg-[var(--muted)]/20",
                          !row.incluidoNaApuracao && "bg-amber-50/50",
                          isSelected && "bg-[var(--primary)]/10",
                        )}
                        style={{
                          ...tableGridStyle({ showSku, showOrderSku }),
                          height: `${virtualRow.size}px`,
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                        onClick={() =>
                          setSelectedKey(
                            isSelected ? null : row.transacao.transactionKey,
                          )
                        }
                      >
                        <TransactionRowCells
                          row={row}
                          showSku={showSku}
                          showOrderSku={showOrderSku}
                          canonicalSku={canonicalSku}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
        <p className="text-xs text-[var(--muted-foreground)]">
          {rows.length} venda(s) · clique em uma linha para ver a memória de
          cálculo
        </p>
        {selectedRow ? (
          <TaxReportCalculationPanel
            row={selectedRow}
            onClose={() => setSelectedKey(null)}
          />
        ) : null}
      </div>
    </TooltipProvider>
  );
}
