"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TooltipProvider } from "@/components/ui/tooltip";
import { VirtualizedTaxReportTransactionTable } from "@/components/tax-report-transaction-table";
import { readApiError } from "@/lib/api-client-error";
import { formatFinancialMoney, formatFinancialPercent } from "@/lib/financial-margin";
import {
  TAX_REPORT_MONTH_NAMES,
  taxReportPath,
} from "@/lib/tax-report/routes";
import {
  skuImpostoOperacionalMedio,
  skuImpostoOperacionalPercentual,
  skuImpostoOperacionalTotal,
} from "@/lib/tax-report/imposto-operacional";
import { downloadSkuSalesExcel } from "@/lib/tax-report/export-sku-sales-excel";
import type { SkuAggregation, TaxReportPayload } from "@/lib/tax-report/types";

type MonthlyTaxReportSkuClientProps = {
  year: number;
  month: number;
  sku: string;
};

function SkuSummaryCard({ data }: { data: SkuAggregation }) {
  const impostoOperacionalTotal = skuImpostoOperacionalTotal(data);
  const impostoOperacionalMedio = skuImpostoOperacionalMedio(data);
  const impostoOperacionalPercentual = skuImpostoOperacionalPercentual(data);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Card className="p-4">
        <p className="text-xs text-[var(--muted-foreground)]">Vendas</p>
        <p className="mt-1 text-xl font-semibold tabular-nums">
          {data.quantidadeVendas}
        </p>
      </Card>
      <Card className="p-4">
        <p className="text-xs text-[var(--muted-foreground)]">Unidades</p>
        <p className="mt-1 text-xl font-semibold tabular-nums">
          {data.unidadesVendidas}
        </p>
      </Card>
      <Card className="p-4">
        <p className="text-xs text-[var(--muted-foreground)]">Receita</p>
        <p className="mt-1 text-xl font-semibold tabular-nums">
          {formatFinancialMoney(data.receitaTotal)}
        </p>
      </Card>
      <Card className="p-4">
        <p className="text-xs text-[var(--muted-foreground)]">Imposto total</p>
        <p className="mt-1 text-xl font-semibold tabular-nums text-[var(--primary)]">
          {formatFinancialMoney(data.impostoTotal)}
        </p>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          Média {formatFinancialMoney(data.impostoMedioPorVenda)} (
          {formatFinancialPercent(data.impostoMedioPercentual)} s/ receita)
        </p>
      </Card>
      <Card className="p-4">
        <p className="text-xs text-[var(--muted-foreground)]">Imp. operacional</p>
        <p className="mt-1 text-xl font-semibold tabular-nums">
          {formatFinancialMoney(impostoOperacionalTotal)}
        </p>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          Média {formatFinancialMoney(impostoOperacionalMedio)} (
          {formatFinancialPercent(impostoOperacionalPercentual)} s/ receita) · sem
          IRPJ/CSLL
        </p>
      </Card>
    </div>
  );
}

export function MonthlyTaxReportSkuClient({
  year,
  month,
  sku,
}: MonthlyTaxReportSkuClientProps) {
  const [report, setReport] = useState<TaxReportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [filterUf, setFilterUf] = useState("");

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const res = await fetch(
        `/api/reports/monthly-tax?year=${year}&month=${month}`,
      );
      if (res.status === 404) {
        setReport(null);
        setNotFound(true);
        return;
      }
      if (!res.ok) {
        throw new Error(await readApiError(res, "monthly_tax_load_failed"));
      }
      const payload = (await res.json()) as TaxReportPayload;
      const skuData = payload.porSku.find((row) => row.sku === sku);
      if (!skuData) {
        setReport(null);
        setNotFound(true);
        return;
      }
      setReport(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar relatório");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [year, month, sku]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const skuData = useMemo(
    () => report?.porSku.find((row) => row.sku === sku) ?? null,
    [report, sku],
  );

  const filteredTransactions = useMemo(() => {
    if (!skuData) return [];
    if (!filterUf.trim()) return skuData.transacoes;
    const uf = filterUf.trim().toUpperCase();
    return skuData.transacoes.filter(
      (row) => row.transacao.ufDestino === uf,
    );
  }, [skuData, filterUf]);

  const periodLabel = `${TAX_REPORT_MONTH_NAMES[month - 1]}/${year}`;

  if (loading) {
    return (
      <Card className="p-6 text-center text-sm text-[var(--muted-foreground)]">
        Carregando vendas de {sku}…
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50/70 p-4 text-sm text-red-800">
        {error}
      </Card>
    );
  }

  if (notFound || !skuData) {
    return (
      <Card className="p-6 text-center text-sm text-[var(--muted-foreground)]">
        <p>
          Nenhum dado encontrado para o SKU <strong>{sku}</strong> em{" "}
          {periodLabel}.
        </p>
        <Button variant="outline" size="sm" className="mt-4" asChild>
          <Link href={taxReportPath()}>Voltar ao relatório</Link>
        </Button>
      </Card>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        <SkuSummaryCard data={skuData} />

        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Vendas do SKU</h2>
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                placeholder="Filtrar UF"
                value={filterUf}
                onChange={(e) => setFilterUf(e.target.value)}
                maxLength={2}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={filteredTransactions.length === 0}
                onClick={() =>
                  downloadSkuSalesExcel(filteredTransactions, {
                    sku,
                    year,
                    month,
                    filterUf: filterUf.trim() || undefined,
                  })
                }
              >
                <Download className="size-4" />
                Baixar Excel
              </Button>
            </div>
          </div>
          <VirtualizedTaxReportTransactionTable rows={filteredTransactions} />
        </Card>
      </div>
    </TooltipProvider>
  );
}
