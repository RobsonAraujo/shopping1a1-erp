"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormInput } from "@/components/ui/form-input";
import { TooltipProvider } from "@/components/ui/tooltip";
import { VirtualizedTaxReportTransactionTable } from "@/components/relatorio-tributario/tax-report-transaction-table";
import { ItemListSearch } from "@/components/item-list-search";
import { readApiError } from "@/lib/api-client-error";
import { formatFinancialMoney, formatFinancialPercent } from "@/lib/financial-margin";
import { filterByItemListSearch } from "@/lib/item-list-search";
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
import { findSkuInReport, canonicalSkuFromReport } from "@/lib/tax-report/find-sku-in-report";
import { calcularSkuVendasPorUf } from "@/lib/tax-report/sku-vendas-por-uf";
import type { SkuAggregation, TaxReportPayload } from "@/lib/tax-report/types";
import { TaxReportSkuUfBreakdown } from "@/components/relatorio-tributario/tax-report-sku-uf-breakdown";

function formatYmdBr(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

type MonthlyTaxReportSkuClientProps = {
  year: number;
  month: number;
  sku: string;
  /** Quando presente, a tela busca dados do período de dias em vez do mês único. */
  period?: { from: string; to: string };
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
        <p className="text-xs text-[var(--muted-foreground)]">Imp. operacional</p>
        <p className="mt-1 text-xl font-semibold tabular-nums text-[var(--primary)]">
          {formatFinancialMoney(impostoOperacionalTotal)}
        </p>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          Média {formatFinancialMoney(impostoOperacionalMedio)} (
          {formatFinancialPercent(impostoOperacionalPercentual)} s/ receita)
        </p>
      </Card>
      <Card className="p-4">
        <p className="text-xs text-[var(--muted-foreground)]">
          Créditos PIS/COFINS (Meli/ADS/Frete/Custos fixos)
        </p>
        <p className="mt-1 text-xl font-semibold tabular-nums text-[var(--primary)]">
          {formatFinancialMoney(data.creditoOutrasDespesasTotal ?? 0)}
        </p>
        {data.creditoCustosFixosTotal ? (
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            Custos fixos: {formatFinancialMoney(data.creditoCustosFixosTotal)}
          </p>
        ) : null}
      </Card>
    </div>
  );
}

export function MonthlyTaxReportSkuClient({
  year,
  month,
  sku,
  period,
}: MonthlyTaxReportSkuClientProps) {
  const [report, setReport] = useState<TaxReportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [filterUf, setFilterUf] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const res = await fetch(
        period
          ? `/api/reports/period-tax?from=${period.from}&to=${period.to}`
          : `/api/reports/monthly-tax?year=${year}&month=${month}`,
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
      const skuData = findSkuInReport(payload.porSku, sku);
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
  }, [year, month, sku, period]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const skuData = useMemo(
    () => (report ? findSkuInReport(report.porSku, sku) : null),
    [report, sku],
  );

  const canonicalSku = skuData?.sku ?? canonicalSkuFromReport(report?.porSku ?? [], sku);
  const hasLegacySkus = (skuData?.skuAliases?.length ?? 0) > 0;

  const vendasPorUf = useMemo(
    () => (skuData ? calcularSkuVendasPorUf(skuData.transacoes) : []),
    [skuData],
  );

  const ufFilteredTransactions = useMemo(() => {
    if (!skuData) return [];
    if (!filterUf.trim()) return skuData.transacoes;
    const uf = filterUf.trim().toUpperCase();
    return skuData.transacoes.filter(
      (row) => row.transacao.ufDestino === uf,
    );
  }, [skuData, filterUf]);

  const filteredTransactions = useMemo(
    () =>
      filterByItemListSearch(ufFilteredTransactions, searchQuery, (row) => ({
        sku: row.transacao.sku,
        mlItemId: row.transacao.itemId,
        extra: [
          row.transacao.orderId,
          row.transacao.ufDestino,
          row.transacao.tipoDocumento,
          row.transacao.documento,
          row.transacao.orderDate.slice(0, 10),
          row.memoriaCalculo.join(" "),
        ],
      })),
    [ufFilteredTransactions, searchQuery],
  );

  const periodLabel = period
    ? `${formatYmdBr(period.from)} – ${formatYmdBr(period.to)}`
    : `${TAX_REPORT_MONTH_NAMES[month - 1]}/${year}`;

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
        {hasLegacySkus ? (
          <p className="text-xs text-[var(--muted-foreground)]">
            Cadastro: <span className="font-medium text-[var(--foreground)]">{canonicalSku}</span>
            {" · "}
            inclui vendas como: {skuData?.skuAliases?.join(", ")}
          </p>
        ) : null}

        <SkuSummaryCard data={skuData} />

        <TaxReportSkuUfBreakdown
          rows={vendasPorUf}
          activeUf={filterUf}
          onSelectUf={setFilterUf}
        />

        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Vendas do SKU</h2>
            <div className="flex flex-wrap items-center gap-2">
              <FormInput
                aria-label="Filtrar UF"
                placeholder="Filtrar UF"
                value={filterUf}
                onChange={(e) => setFilterUf(e.target.value)}
                maxLength={2}
                className="w-32"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={filteredTransactions.length === 0}
                onClick={() =>
                  downloadSkuSalesExcel(filteredTransactions, {
                    sku: canonicalSku,
                    year: period ? null : year,
                    month: period ? null : month,
                    periodLabel: period
                      ? `${period.from}_a_${period.to}`
                      : undefined,
                    filterUf: filterUf.trim() || undefined,
                  })
                }
              >
                <Download className="size-4" />
                Baixar Excel
              </Button>
            </div>
          </div>
          <ItemListSearch
            value={searchQuery}
            onChange={setSearchQuery}
            filteredCount={filteredTransactions.length}
            totalCount={ufFilteredTransactions.length}
            placeholder="Buscar por pedido, UF, documento ou memória…"
            entitySingular="venda"
            entityPlural="vendas"
            className="mb-3"
          />
          <VirtualizedTaxReportTransactionTable
            rows={filteredTransactions}
            canonicalSku={canonicalSku}
            showOrderSku={hasLegacySkus}
          />
        </Card>
      </div>
    </TooltipProvider>
  );
}
