"use client";

import { useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Info, X } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatFinancialMoney } from "@/lib/financial-margin";
import type { DetalhamentoTributario } from "@/lib/tax-report/types";
import { cn } from "@/lib/utils";

const ROW_HEIGHT = 44;

function gridColsClass(showSku: boolean) {
  return showSku
    ? "grid-cols-[6.5rem_8rem_3.5rem_4.5rem_6.5rem_7.5rem_5.5rem_7.5rem_6rem]"
    : "grid-cols-[6.5rem_3.5rem_4.5rem_6.5rem_7.5rem_5.5rem_7.5rem_6rem]";
}

export function TaxReportHeaderWithTip({
  label,
  tip,
}: {
  label: string;
  tip: string;
}) {
  return (
    <span className="inline-flex items-center justify-end gap-1 whitespace-nowrap">
      {label}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            aria-label={`Sobre ${label}`}
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
      className={cn(
        "sticky top-0 z-10 grid items-center border-b border-[var(--border)] bg-[var(--background)] text-left text-xs text-[var(--muted-foreground)]",
        gridColsClass(showSku),
      )}
    >
      <span className="px-3 py-2.5 whitespace-nowrap">Data</span>
      {showSku ? (
        <span className="px-3 py-2.5 whitespace-nowrap">SKU</span>
      ) : null}
      <span className="px-3 py-2.5 whitespace-nowrap">UF</span>
      <span className="px-3 py-2.5 whitespace-nowrap">Doc.</span>
      <span className="px-3 py-2.5 text-right whitespace-nowrap">Receita</span>
      <span className="px-3 py-2.5 text-right whitespace-nowrap">
        <TaxReportHeaderWithTip
          label="PIS/COFINS"
          tip="Líquido após crédito de CMV."
        />
      </span>
      <span className="px-3 py-2.5 text-right whitespace-nowrap">
        <TaxReportHeaderWithTip
          label="ICMS"
          tip="Interestadual + DIFAL quando aplicável."
        />
      </span>
      <span className="px-3 py-2.5 text-right whitespace-nowrap">
        <TaxReportHeaderWithTip
          label="IRPJ+CSLL"
          tip="Estimativa por venda; adicional IRPJ 10% no consolidado mensal."
        />
      </span>
      <span className="px-3 py-2.5 text-right whitespace-nowrap">Margem</span>
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
  return (
    <>
      <span className="px-3 text-xs whitespace-nowrap">
        {t.orderDate.slice(0, 10)}
      </span>
      {showSku ? (
        <span className="truncate px-3 font-medium">{t.sku}</span>
      ) : null}
      <span className="px-3 whitespace-nowrap">{t.ufDestino ?? "—"}</span>
      <span className="px-3 whitespace-nowrap">{t.tipoDocumento}</span>
      <span className="px-3 text-right tabular-nums whitespace-nowrap">
        {formatFinancialMoney(t.receitaBruta)}
      </span>
      <span className="px-3 text-right tabular-nums whitespace-nowrap">
        {formatFinancialMoney(row.pisCofins?.liquido ?? null)}
      </span>
      <span className="px-3 text-right tabular-nums whitespace-nowrap">
        {formatFinancialMoney(row.icmsDifal?.icmsTotal ?? null)}
      </span>
      <span className="px-3 text-right tabular-nums whitespace-nowrap">
        {formatFinancialMoney(
          (row.irpjCsll?.irpjTotal ?? 0) + (row.irpjCsll?.csll ?? 0),
        )}
      </span>
      <span className="px-3 text-right tabular-nums whitespace-nowrap">
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
            {t.orderDate.slice(0, 10)} · {t.ufDestino ?? "UF —"} ·{" "}
            {t.tipoDocumento}
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
        <div
          ref={parentRef}
          className="max-h-[32rem] overflow-auto rounded-lg border border-[var(--border)]"
        >
          <div className="min-w-[62rem] text-sm">
            <TransactionTableHeader showSku={showSku} />
            <div
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
                      "absolute left-0 grid w-full cursor-pointer items-center border-b border-[var(--border)] hover:bg-[var(--muted)]/20",
                      gridColsClass(showSku),
                      !row.incluidoNaApuracao && "bg-amber-50/50",
                      isSelected && "bg-[var(--primary)]/10",
                    )}
                    style={{
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
