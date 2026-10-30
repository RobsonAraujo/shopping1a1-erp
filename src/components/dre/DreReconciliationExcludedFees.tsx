"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { formatFinancialMoney } from "@/lib/pricing/financial-margin";
import type {
  ExcludedFeeReason,
  ExcludedFeeSummary,
} from "@/lib/dre/reconciliation/types";
import { cn } from "@/lib/utils";

const REASON_TEXT: Record<ExcludedFeeReason, string> = {
  in_sales_tax:
    "Imposto que o ML recolheu por você. Já está em Impostos sobre vendas (calculado pelo Tributário). Confira com o contador se a guia de DIFAL abate esse valor.",
  non_operational:
    "Juros de empréstimo (Mercado Crédito), não é tarifa de venda. Se quiser no DRE, lance em Saídas não operacionais ou onde fizer sentido.",
  unrecognized:
    "Tarifa que o DRE não reconhece. Se for custo da operação, lance à mão na linha certa.",
};

function formatYmdBr(ymd: string | null): string {
  if (!ymd) return "—";
  const [year, month, day] = ymd.split("-");
  return year && month && day ? `${day}/${month}/${year}` : ymd;
}

/**
 * Cobranças da planilha que ficaram fora das linhas do DRE (juros, DIFAL no
 * Lucro Real, nome desconhecido), com o que for preciso para achar cada uma no
 * Mercado Livre. Só informa: nada aqui muda o DRE.
 */
export function DreReconciliationExcludedFees({
  fees,
}: {
  fees: ExcludedFeeSummary[];
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  if (fees.length === 0) return null;
  const total = fees.reduce((sum, fee) => sum + fee.total, 0);

  return (
    <div className="rounded-lg border border-[var(--border)] text-xs">
      <div className="space-y-0.5 px-3 py-2">
        <p className="font-medium text-[var(--foreground)]">
          Ficaram fora do DRE · {formatFinancialMoney(total)}
        </p>
        <p className="text-[var(--muted-foreground)]">
          Estão na planilha, mas não entram em nenhuma linha ao conciliar.
        </p>
      </div>
      <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
        {fees.map((fee) => {
          const key = `${fee.reason}:${fee.name}`;
          const expanded = openKey === key;
          return (
            <li key={key}>
              <button
                type="button"
                className="flex w-full cursor-pointer items-start justify-between gap-2 px-3 py-2 text-left"
                aria-expanded={expanded}
                onClick={() => setOpenKey(expanded ? null : key)}
              >
                <span className="min-w-0 flex-1 space-y-0.5">
                  <span className="block font-medium text-[var(--foreground)]">
                    {fee.name}
                  </span>
                  <span className="block text-[var(--muted-foreground)]">
                    {REASON_TEXT[fee.reason]}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5 tabular-nums">
                  <span className="text-right">
                    <span className="block font-medium">
                      {formatFinancialMoney(fee.total)}
                    </span>
                    <span className="block text-[var(--muted-foreground)]">
                      {fee.occurrences === 1
                        ? "1 cobrança"
                        : `${fee.occurrences} cobranças`}
                    </span>
                  </span>
                  <ChevronDown
                    className={cn(
                      "size-3.5 text-[var(--muted-foreground)] transition-transform",
                      expanded && "rotate-180",
                    )}
                    aria-hidden
                  />
                </span>
              </button>
              {expanded ? (
                <div className="space-y-1.5 px-3 pb-2">
                  <div className="overflow-x-auto rounded-md border border-[var(--border)]">
                    <table className="w-full text-[11px]">
                      <thead className="bg-[var(--muted)]/30 text-[var(--muted-foreground)]">
                        <tr>
                          <th className="px-2 py-1 text-left font-medium">Linha</th>
                          <th className="px-2 py-1 text-left font-medium">Data</th>
                          <th className="px-2 py-1 text-left font-medium">Nº da operação</th>
                          <th className="px-2 py-1 text-left font-medium">Fatura</th>
                          <th className="px-2 py-1 text-right font-medium">Valor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {fee.samples.map((sample) => (
                          <tr key={`${sample.rowIndex}:${sample.feeId ?? ""}`}>
                            <td className="px-2 py-1 tabular-nums">{sample.rowIndex}</td>
                            <td className="px-2 py-1 tabular-nums">
                              {formatYmdBr(sample.operationDate)}
                            </td>
                            <td className="px-2 py-1">
                              <span className="block tabular-nums">{sample.operationId}</span>
                              <span className="block text-[var(--muted-foreground)]">
                                {sample.operationType}
                                {sample.feeId && sample.feeId !== sample.operationId
                                  ? ` · tarifa ${sample.feeId}`
                                  : ""}
                              </span>
                            </td>
                            <td className="px-2 py-1">
                              <span className="block tabular-nums">
                                {sample.billingPeriod ?? "—"}
                              </span>
                              {sample.closingDate ? (
                                <span className="block text-[var(--muted-foreground)]">
                                  fecha {formatYmdBr(sample.closingDate)}
                                </span>
                              ) : null}
                            </td>
                            <td className="px-2 py-1 text-right tabular-nums">
                              {formatFinancialMoney(sample.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {fee.occurrences > fee.samples.length ? (
                    <p className="text-[var(--muted-foreground)]">
                      Mostrando {fee.samples.length} de {fee.occurrences} cobranças.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="border-t border-[var(--border)] px-3 py-2 text-[11px] text-[var(--muted-foreground)]">
        “Linha” é a linha da planilha. Para achar a cobrança no Mercado Livre,
        procure o nº da operação na coluna “Número da operação” ou no extrato do
        Mercado Pago. Cobrança pós-paga entra na fatura do período indicado.
      </p>
    </div>
  );
}
