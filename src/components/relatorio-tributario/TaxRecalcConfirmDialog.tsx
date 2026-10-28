"use client";

import { RefreshCw } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  formatFinancialMoney,
  formatFinancialPercent,
} from "@/lib/pricing/financial-margin";
import type {
  TaxRecalcPreview,
  TaxReportDreFollowUp,
} from "@/lib/tax-report/types";

/**
 * - `recompute`: recalcular o tributário com as vendas salvas (sem ML);
 * - `regenerate`: recalcular o tributário buscando os pedidos no ML;
 * - `refresh`: só o imposto do DRE, com o tributário já salvo.
 */
export type TaxRecalcKind = "recompute" | "regenerate" | "refresh";

export type TaxRecalcMonthPreview = {
  month: number;
  label: string;
  /** null enquanto carrega (ou para `regenerate`, que não tem prévia). */
  report: TaxRecalcPreview["report"] | null;
  dre: TaxReportDreFollowUp | null;
  error?: string;
};

function rate(tax: number, revenue: number): number | null {
  return revenue > 0 ? (tax / revenue) * 100 : null;
}

function dreLine(dre: TaxReportDreFollowUp | null): string | null {
  if (!dre) return null;
  switch (dre.status) {
    case "updated":
      return `Impostos sobre vendas no DRE: ${formatFinancialMoney(dre.previousTaxErp)} → ${formatFinancialMoney(dre.taxErp)}`;
    case "unchanged":
      return `Impostos sobre vendas no DRE: continua ${formatFinancialMoney(dre.taxErp)}`;
    case "manual_edit":
      return `Impostos sobre vendas no DRE está ajustado à mão (${formatFinancialMoney(dre.previousTaxErp)}) e fica como está`;
    case "needs_sync":
      return "DRE do mês é de uma versão antiga — depois, sincronize o mês no DRE";
    case "no_snapshot":
      return "Mês sem DRE";
    case "failed":
      return "Não foi possível calcular o imposto do DRE";
  }
}

/**
 * Confirmação com antes → depois. Recalcular um mês passado usa o cadastro e
 * a configuração tributária de hoje (o nivelamento vale para o período) — o
 * número pode mudar bastante, e o imposto do DRE acompanha: nada disso
 * acontece sem o usuário ver antes.
 */
export function TaxRecalcConfirmDialog({
  open,
  kind,
  months,
  loading,
  confirming,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  kind: TaxRecalcKind;
  months: TaxRecalcMonthPreview[];
  loading: boolean;
  confirming: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const names = months.map((m) => m.label).join(", ");
  const title =
    kind === "refresh"
      ? `Atualizar o imposto de ${names}?`
      : kind === "regenerate"
        ? `Recalcular o tributário de ${names}?`
        : `Atualizar o cálculo do tributário de ${names}?`;
  const description =
    kind === "refresh"
      ? "Aplica o % de cada produto do relatório tributário salvo à receita do mês — sem buscar nada no Mercado Livre."
      : kind === "regenerate"
        ? "Busca de novo os pedidos no Mercado Livre (pode levar alguns minutos) e recalcula com o cadastro de produtos, o nivelamento e a configuração tributária de hoje. O imposto do DRE acompanha."
        : "Refaz o cálculo com as vendas já salvas, usando o cadastro de produtos, o nivelamento e a configuração tributária de hoje — sem buscar nada no Mercado Livre. O imposto do DRE acompanha.";
  const confirmLabel =
    kind === "refresh"
      ? "Atualizar imposto"
      : kind === "regenerate"
        ? "Recalcular"
        : "Atualizar cálculo";
  const anyError = months.some((m) => m.error);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !confirming) onCancel();
      }}
    >
      <AlertDialogContent className="sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {kind !== "regenerate" ? (
          <div className="space-y-2 text-sm">
            {loading ? (
              <p className="flex items-center gap-2 text-[var(--muted-foreground)]">
                <RefreshCw className="size-3.5 animate-spin" aria-hidden />
                Calculando a prévia…
              </p>
            ) : (
              months.map((month) => (
                <div
                  key={month.month}
                  className="rounded-lg border border-[var(--border)] px-3 py-2"
                >
                  {months.length > 1 ? (
                    <p className="mb-1 font-medium">{month.label}</p>
                  ) : null}
                  {month.error ? (
                    <p className="text-xs text-rose-700">{month.error}</p>
                  ) : (
                    <ul className="space-y-0.5 text-xs text-[var(--muted-foreground)]">
                      {month.report ? (
                        <li className="tabular-nums">
                          Tributário:{" "}
                          {formatFinancialPercent(
                            rate(month.report.before.tax, month.report.before.revenue),
                          )}{" "}
                          ({formatFinancialMoney(month.report.before.tax)}) →{" "}
                          <span className="font-medium text-[var(--foreground)]">
                            {formatFinancialPercent(
                              rate(month.report.after.tax, month.report.after.revenue),
                            )}{" "}
                            ({formatFinancialMoney(month.report.after.tax)})
                          </span>
                        </li>
                      ) : null}
                      {dreLine(month.dre) ? (
                        <li className="tabular-nums">{dreLine(month.dre)}</li>
                      ) : null}
                    </ul>
                  )}
                </div>
              ))
            )}
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={confirming}>Cancelar</AlertDialogCancel>
          <Button
            type="button"
            disabled={loading || confirming || anyError}
            onClick={onConfirm}
          >
            {confirming ? (
              <RefreshCw className="mr-1.5 size-3.5 animate-spin" aria-hidden />
            ) : null}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
