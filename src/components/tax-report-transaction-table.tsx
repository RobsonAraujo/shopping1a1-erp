"use client";

import { useRef, useState, type CSSProperties } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AlertTriangle, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  formatFinancialMoney,
  formatFinancialPercent,
  percentOfSale,
} from "@/lib/financial-margin";
import type { DetalhamentoTributario } from "@/lib/tax-report/types";
import { icmsSemDifal } from "@/lib/tax-report/calculators/icms-difal";
import { impostoOperacionalLinha, margemOperacionalEstimadaLinha } from "@/lib/tax-report/imposto-operacional";
import { TaxReportCalculationPanel } from "@/components/tax-report-calculation-panel";
import { cn } from "@/lib/utils";

const ROW_HEIGHT = 52;

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
}: {
  showSku?: boolean;
  showOrderSku?: boolean;
}) {
  return (
    <div
      className="grid w-full items-center border-b border-[var(--border)] bg-[var(--background)] text-left text-xs text-[var(--muted-foreground)]"
      style={tableGridStyle({ showSku, showOrderSku })}
    >
      <span className="min-w-0 px-2 py-2.5 whitespace-nowrap">Data</span>
      {showOrderSku ? (
        <span className="min-w-0 truncate px-2 py-2.5">
          <TaxReportHeaderWithTip
            label="SKU no pedido"
            tip="Nome do SKU registrado no pedido do Mercado Livre. Pode diferir do cadastro atual quando o SKU foi renomeado."
            align="left"
          />
        </span>
      ) : null}
      {showSku ? (
        <span className="min-w-0 truncate px-2 py-2.5">SKU</span>
      ) : null}
      <span className="min-w-0 py-2.5 pr-4 pl-2 whitespace-nowrap">UF</span>
      <span className="min-w-0 truncate py-2.5 pr-2 pl-4">Doc.</span>
      <span className="min-w-0 px-2 py-2.5 text-right">
        <TaxReportHeaderWithTip
          label="Qtd"
          tip="Unidades vendidas nesta linha do pedido."
          align="right"
        />
      </span>
      <span className="px-2 py-2.5 text-right whitespace-nowrap">Receita</span>
      <span className="px-2 py-2.5 text-right whitespace-nowrap">
        <TaxReportHeaderWithTip
          label="PIS/COFINS"
          tip="Líquido após crédito na NF de entrada. Passe o mouse no valor da linha para ver débito e crédito."
        />
      </span>
      <span className="px-2 py-2.5 text-right whitespace-nowrap">
        <TaxReportHeaderWithTip
          label="ICMS"
          tip="ICMS interno ou interestadual (UF origem) — sem DIFAL."
        />
      </span>
      <span className="px-2 py-2.5 text-right whitespace-nowrap">
        <TaxReportHeaderWithTip
          label="DIFAL"
          tip="Diferencial de alíquota (EC 87/2015) para comprador não contribuinte."
        />
      </span>
      <span className="px-2 py-2.5 text-right whitespace-nowrap">
        <TaxReportHeaderWithTip
          label="Imp. oper."
          tip="PIS/COFINS + ICMS por venda. Percentual sobre a receita bruta."
        />
      </span>
      <span className="px-2 py-2.5 text-right whitespace-nowrap">
        <TaxReportHeaderWithTip
          label="Margem oper."
          tip="Receita menos CMV e impostos operacionais nesta venda."
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
      <span className="min-w-0 truncate py-2.5 pr-2 pl-4 whitespace-nowrap">{t.tipoDocumento}</span>
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
  const parentRef = useRef<HTMLDivElement>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  const selectedRow =
    selectedKey != null
      ? (rows.find((row) => row.transacao.transactionKey === selectedKey) ??
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
        <div className="overflow-hidden rounded-lg border border-[var(--border)] text-sm">
          <TransactionTableHeader showSku={showSku} showOrderSku={showOrderSku} />
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
                const row = rows[virtualRow.index];
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
