"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, RefreshCw, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormSelect } from "@/components/ui/form-select";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TaxReportApuracaoPanel } from "@/components/tax-report-apuracao-panel";
import {
  TaxReportGenerationOverlay,
  type TaxReportProgressState,
} from "@/components/tax-report-generation-overlay";
import { TaxReportHeaderWithTip } from "@/components/tax-report-transaction-table";
import {
  ItemListSearch,
  itemListSearchEmptyMessage,
} from "@/components/item-list-search";
import { readApiError } from "@/lib/api-client-error";
import { formatFinancialMoney, formatFinancialPercent } from "@/lib/financial-margin";
import { filterByItemListSearch } from "@/lib/item-list-search";
import { getZonedYearMonth } from "@/lib/mercadolibre/revenue-periods";
import {
  TAX_REPORT_MONTH_NAMES,
  taxReportSkuPath,
} from "@/lib/tax-report/routes";
import {
  skuImpostoOperacionalMedio,
  skuImpostoOperacionalPercentual,
} from "@/lib/tax-report/imposto-operacional";
import type { TaxReportPayload } from "@/lib/tax-report/types";
import { cn } from "@/lib/utils";

function SummaryCard({
  label,
  value,
  tip,
  highlight,
}: {
  label: string;
  value: string;
  tip: string;
  highlight?: boolean;
}) {
  return (
    <Card className="p-4">
      <p className="text-xs text-[var(--muted-foreground)]">
        <TaxReportHeaderWithTip label={label} tip={tip} />
      </p>
      <p
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums",
          highlight && "text-[var(--primary)]",
        )}
      >
        {value}
      </p>
    </Card>
  );
}

export function MonthlyTaxReportClient() {
  const now = getZonedYearMonth();
  const [year, setYear] = useState(now.year);
  const [month, setMonth] = useState(now.month);
  const [report, setReport] = useState<TaxReportPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateProgress, setGenerateProgress] =
    useState<TaxReportProgressState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/reports/monthly-tax?year=${year}&month=${month}`,
      );
      if (res.status === 404) {
        setReport(null);
        return;
      }
      if (!res.ok) {
        throw new Error(await readApiError(res, "monthly_tax_load_failed"));
      }
      setReport((await res.json()) as TaxReportPayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar relatório");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  const generateReport = useCallback(
    async (force: boolean) => {
      setGenerating(true);
      setGenerateProgress({
        phase: "orders",
        message: "Iniciando geração do relatório…",
      });
      setError(null);
      try {
        const res = await fetch("/api/reports/monthly-tax", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ year, month, force, stream: true }),
        });

        if (!res.ok || !res.body) {
          throw new Error(await readApiError(res, "monthly_tax_generate_failed"));
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";

          for (const chunk of chunks) {
            const line = chunk.trim();
            if (!line.startsWith("data: ")) continue;
            const data = JSON.parse(line.slice(6)) as
              | { type: "progress" } & TaxReportProgressState
              | { type: "complete" }
              | { type: "error"; message: string };

            if (data.type === "progress") {
              setGenerateProgress({
                phase: data.phase,
                message: data.message,
                current: data.current,
                total: data.total,
              });
            } else if (data.type === "complete") {
              await loadReport();
              setGenerateProgress({
                phase: "done",
                message: "Relatório gerado com sucesso.",
              });
            } else if (data.type === "error") {
              throw new Error(data.message);
            }
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao gerar relatório");
      } finally {
        setGenerating(false);
        setTimeout(() => setGenerateProgress(null), 400);
      }
    },
    [year, month, loadReport],
  );

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const years = useMemo(() => {
    const current = now.year;
    return [current - 1, current, current + 1];
  }, [now.year]);

  const yearOptions = useMemo(
    () =>
      years.map((y) => ({
        value: String(y),
        label: String(y),
      })),
    [years],
  );

  const monthOptions = useMemo(
    () =>
      TAX_REPORT_MONTH_NAMES.map((name, index) => ({
        value: String(index + 1),
        label: name,
      })),
    [],
  );

  const filteredSkuRows = useMemo(
    () =>
      filterByItemListSearch(report?.porSku ?? [], searchQuery, (row) => ({
        sku: row.sku,
        extra: [
          String(row.quantidadeVendas),
          String(row.unidadesVendidas),
          String(row.receitaTotal),
        ],
      })),
    [report?.porSku, searchQuery],
  );

  return (
    <TooltipProvider delayDuration={200}>
      {generating && generateProgress ? (
        <TaxReportGenerationOverlay progress={generateProgress} />
      ) : null}
      <div className="space-y-4">
        <Card className="border-amber-200 bg-amber-50/60 p-4 text-sm text-amber-950">
          <p className="font-medium">Estimativa gerencial — Lucro Real</p>
          <p className="mt-1 text-xs leading-relaxed">
            Não substitui a apuração contábil oficial (LALUR/e-Lalur). O DRE
            continua usando percentual simplificado por SKU; aqui cada venda é
            calculada com UF de destino e tipo de comprador.
          </p>
        </Card>

        <div className="flex flex-wrap items-end gap-3">
          <FormSelect
            id="tax-report-year"
            label="Ano"
            value={String(year)}
            onValueChange={(value) => setYear(Number(value))}
            options={yearOptions}
            disabled={generating}
            triggerClassName="w-[7.5rem]"
          />
          <FormSelect
            id="tax-report-month"
            label="Mês"
            value={String(month)}
            onValueChange={(value) => setMonth(Number(value))}
            options={monthOptions}
            disabled={generating}
            triggerClassName="w-[10.5rem]"
          />
          <Button
            type="button"
            disabled={loading || generating}
            onClick={() => void generateReport(false)}
          >
            Gerar relatório
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={loading || generating}
            onClick={() => void generateReport(true)}
          >
            <RefreshCw className="mr-2 size-4" />
            Recalcular
          </Button>
        </div>

        {error ? (
          <Card className="border-red-200 bg-red-50/70 p-4 text-sm text-red-800">
            {error}
          </Card>
        ) : null}

        {!report && !loading && !generating && !error ? (
          <Card className="p-6 text-center text-sm text-[var(--muted-foreground)]">
            Nenhum snapshot salvo para {TAX_REPORT_MONTH_NAMES[month - 1]}/{year}.
            Clique em &quot;Gerar relatório&quot; para buscar pedidos no Mercado Livre.
          </Card>
        ) : null}

        {report ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <SummaryCard
                label="Faturamento"
                value={formatFinancialMoney(report.consolidado.faturamento)}
                tip="Soma da receita bruta das vendas incluídas na apuração (pedidos pagos)."
              />
              <SummaryCard
                label="PIS/COFINS líquido"
                value={formatFinancialMoney(
                  report.consolidado.apuracao?.pisCofinsLiquido ??
                    report.consolidado.pisCofinsLiquido,
                )}
                tip="Débito sobre a venda menos crédito sobre NF de entrada (não-cumulativo)."
              />
              <SummaryCard
                label="Margem líquida est."
                value={formatFinancialMoney(report.consolidado.margemLiquida)}
                tip="Faturamento − CMV − impostos − IRPJ/CSLL estimados do mês."
                highlight
              />
            </div>

            {report.consolidado.apuracao ? (
              <TaxReportApuracaoPanel
                apuracao={report.consolidado.apuracao}
                faturamento={report.consolidado.faturamento}
              />
            ) : null}

            <p className="text-xs text-[var(--muted-foreground)]">
              Gerado em {new Date(report.meta.geradoEm).toLocaleString("pt-BR")}{" "}
              · {report.meta.pedidosProcessados} pedidos ·{" "}
              {report.meta.linhasProcessadas} linhas ·{" "}
              {report.meta.semBillingInfo} sem billing_info · UF origem{" "}
              {report.meta.originUf}
            </p>

            <Card className="p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <Scale className="size-4" />
                  Por SKU
                </h2>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Clique no SKU para ver as vendas
                </p>
              </div>
              <ItemListSearch
                value={searchQuery}
                onChange={setSearchQuery}
                filteredCount={filteredSkuRows.length}
                totalCount={report.porSku.length}
                placeholder="Buscar por SKU, vendas, unidades ou receita…"
                entitySingular="SKU"
                entityPlural="SKUs"
                className="mb-3"
              />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[52rem] text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted-foreground)]">
                      <th className="py-2 pr-3">SKU</th>
                      <th className="py-2 pr-3 text-right">Vendas</th>
                      <th className="py-2 pr-3 text-right">Unidades</th>
                      <th className="py-2 pr-3 text-right">Receita</th>
                      <th className="py-2 pr-3 text-right">
                        <TaxReportHeaderWithTip
                          label="Imp. oper. médio"
                          tip="Média de PIS/COFINS + ICMS por venda — sem IRPJ/CSLL."
                        />
                      </th>
                      <th className="py-2 pr-3 text-right">
                        <TaxReportHeaderWithTip
                          label="% oper."
                          tip="Imposto operacional total do SKU sobre a receita."
                        />
                      </th>
                      <th className="py-2 pr-3 text-right">
                        <TaxReportHeaderWithTip
                          label="Imposto médio"
                          tip="Média do imposto total por venda (inclui IRPJ+CSLL estimados)."
                        />
                      </th>
                      <th className="py-2 pr-3 text-right">
                        <TaxReportHeaderWithTip
                          label="% total"
                          tip="Imposto total do SKU (com IRPJ+CSLL) sobre a receita."
                        />
                      </th>
                      <th className="py-2 w-8" aria-hidden />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSkuRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={9}
                          className="py-8 text-center text-sm text-[var(--muted-foreground)]"
                        >
                          {itemListSearchEmptyMessage(searchQuery, "SKU")}
                        </td>
                      </tr>
                    ) : (
                      filteredSkuRows.map((row) => (
                      <tr
                        key={row.sku}
                        className="border-b border-[var(--border)] hover:bg-[var(--muted)]/20"
                      >
                        <td className="py-2 pr-3 font-medium">
                          <Link
                            href={taxReportSkuPath(year, month, row.sku)}
                            className="inline-flex items-center gap-1 text-[var(--primary)] hover:underline"
                          >
                            {row.sku}
                          </Link>
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {row.quantidadeVendas}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {row.unidadesVendidas}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {formatFinancialMoney(row.receitaTotal)}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {formatFinancialMoney(skuImpostoOperacionalMedio(row))}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {formatFinancialPercent(
                            skuImpostoOperacionalPercentual(row),
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {formatFinancialMoney(row.impostoMedioPorVenda)}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {formatFinancialPercent(row.impostoMedioPercentual)}
                        </td>
                        <td className="py-2 text-[var(--muted-foreground)]">
                          <Link
                            href={taxReportSkuPath(year, month, row.sku)}
                            aria-label={`Ver vendas de ${row.sku}`}
                          >
                            <ChevronRight className="size-4" />
                          </Link>
                        </td>
                      </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
