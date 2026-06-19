"use client";

import { useRef, useState, type CSSProperties } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AlertTriangle, Info, X } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  formatFinancialMoney,
  formatFinancialPercent,
  percentOfSale,
} from "@/lib/financial-margin";
import type { DetalhamentoTributario } from "@/lib/tax-report/types";
import { icmsSemDifal } from "@/lib/tax-report/calculators/icms-difal";
import { impostoOperacionalLinha } from "@/lib/tax-report/imposto-operacional";
import { cn } from "@/lib/utils";

const ROW_HEIGHT = 52;

/** 12 colunas — cabe em max-w-7xl sem scroll horizontal. */
const GRID_COLS_DETAIL =
  "5rem 3.25rem minmax(4.25rem,0.55fr) minmax(4rem,0.5fr) minmax(4.5rem,1fr) minmax(4.5rem,1fr) minmax(4rem,1fr) minmax(3.75rem,1fr) minmax(4rem,1fr) minmax(4.5rem,1fr) minmax(4.5rem,1fr) minmax(4.25rem,1fr)";

const GRID_COLS_WITH_SKU =
  "5rem minmax(4rem,1fr) 3.25rem minmax(4.25rem,0.55fr) minmax(4rem,0.5fr) minmax(4.5rem,1fr) minmax(4.5rem,1fr) minmax(4rem,1fr) minmax(3.75rem,1fr) minmax(4rem,1fr) minmax(4.5rem,1fr) minmax(4.5rem,1fr) minmax(4.25rem,1fr)";

function tableGridStyle(showSku: boolean): CSSProperties {
  return {
    gridTemplateColumns: showSku ? GRID_COLS_WITH_SKU : GRID_COLS_DETAIL,
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

function TransactionTableHeader({ showSku }: { showSku: boolean }) {
  return (
    <div
      className="grid w-full items-center border-b border-[var(--border)] bg-[var(--background)] text-left text-xs text-[var(--muted-foreground)]"
      style={tableGridStyle(showSku)}
    >
      <span className="min-w-0 px-2 py-2.5 whitespace-nowrap">Data</span>
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
          label="IRPJ+CSLL"
          tip="Estimativa por venda; adicional IRPJ 10% no consolidado mensal."
        />
      </span>
      <span className="px-2 py-2.5 text-right whitespace-nowrap">
        <TaxReportHeaderWithTip
          label="Imp. oper."
          tip="PIS/COFINS + ICMS por venda — sem IRPJ/CSLL. Percentual sobre a receita bruta."
        />
      </span>
      <span className="px-2 py-2.5 text-right whitespace-nowrap">
        <TaxReportHeaderWithTip
          label="Imposto"
          tip="Imposto total (PIS/COFINS + ICMS + IRPJ+CSLL) e percentual sobre a receita bruta."
        />
      </span>
      <span className="px-2 py-2.5 text-right whitespace-nowrap">
        <TaxReportHeaderWithTip
          label="Margem"
          tip="Receita menos CMV e impostos estimados nesta venda."
        />
      </span>
    </div>
  );
}

function TransactionRowCells({
  row,
  showSku,
}: {
  row: DetalhamentoTributario;
  showSku: boolean;
}) {
  const t = row.transacao;
  const impostoOperacional = impostoOperacionalLinha(row);
  const impostoOperacionalPercent =
    impostoOperacional != null
      ? percentOfSale(impostoOperacional, t.receitaBruta)
      : null;
  const impostoPercent = row.incluidoNaApuracao
    ? percentOfSale(row.impostoTotal, t.receitaBruta)
    : null;

  return (
    <>
      <span className="px-2 text-xs whitespace-nowrap">
        {t.orderDate.slice(0, 10)}
      </span>
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
      <span className="px-2 text-right tabular-nums whitespace-nowrap">
        {formatFinancialMoney(
          (row.irpjCsll?.irpjTotal ?? 0) + (row.irpjCsll?.csll ?? 0),
        )}
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
          {formatFinancialPercent(impostoPercent)}
        </span>
        <span className="text-[10px] text-[var(--muted-foreground)]">
          {formatFinancialMoney(row.incluidoNaApuracao ? row.impostoTotal : null)}
        </span>
      </span>
      <span className="px-2 text-right tabular-nums whitespace-nowrap">
        {formatFinancialMoney(row.margemLiquidaEstimada)}
      </span>
    </>
  );
}

export function TaxReportCalculationPanel({
  row,
  onClose,
}: {
  row: DetalhamentoTributario;
  onClose: () => void;
}) {
  const t = row.transacao;
  return (
    <Card className="border-[var(--primary)]/20 bg-[var(--muted)]/10 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Memória de cálculo</p>
          <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
            {t.orderDate.slice(0, 10)} · Pedido {t.orderId} ·{" "}
            {t.ufDestino ?? "UF —"} · {t.tipoDocumento} · Qtd {t.quantidade}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          onClick={onClose}
          aria-label="Fechar memória de cálculo"
        >
          <X className="size-4" />
        </Button>
      </div>
      {t.dadosFiscaisIndisponiveis ? (
        <p className="mb-2 text-xs font-medium text-amber-800">
          Dados fiscais indisponíveis no Mercado Livre — venda excluída da
          apuração até revisão manual.
        </p>
      ) : null}
      {!t.unitCostNf && row.incluidoNaApuracao ? (
        <p className="mb-2 text-xs font-medium text-amber-800">
          SKU sem custo NF cadastrado — créditos PIS/COFINS e ICMS de compra
          zerados nesta linha.
        </p>
      ) : null}
      <ul className="space-y-1 font-mono text-xs text-[var(--muted-foreground)]">
        {row.memoriaCalculo.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </Card>
  );
}

export function VirtualizedTaxReportTransactionTable({
  rows,
  showSku = false,
}: {
  rows: DetalhamentoTributario[];
  showSku?: boolean;
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
          <TransactionTableHeader showSku={showSku} />
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
                      ...tableGridStyle(showSku),
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    onClick={() =>
                      setSelectedKey(
                        isSelected ? null : row.transacao.transactionKey,
                      )
                    }
                  >
                    <TransactionRowCells row={row} showSku={showSku} />
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
