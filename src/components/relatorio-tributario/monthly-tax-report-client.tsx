"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Scale, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { UserFeedback } from "@/components/ui/user-feedback";
import { FormSelect } from "@/components/ui/form-select";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TaxReportApuracaoPanel } from "@/components/relatorio-tributario/tax-report-apuracao-panel";
import {
  TaxFixedCostsModal,
  type TaxFixedCostItemRow,
} from "@/components/relatorio-tributario/tax-fixed-costs-modal";
import {
  TaxReportGenerationOverlay,
  type TaxReportProgressState,
} from "@/components/relatorio-tributario/tax-report-generation-overlay";
import { TaxReportHeaderWithTip } from "@/components/relatorio-tributario/tax-report-transaction-table";
import { TaxReportSkuTable } from "@/components/relatorio-tributario/tax-report-sku-table";
import { ItemListSearch } from "@/components/item-list-search";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { readApiError } from "@/lib/api-client-error";
import { useSSEStream } from "@/hooks/use-sse-stream";
import { lastDaysYmdRange, todayYmdLocal } from "@/lib/date-range";
import { formatFinancialMoney } from "@/lib/financial-margin";
import { filterByItemListSearch } from "@/lib/item-list-search";
import { getZonedYearMonth } from "@/lib/mercadolibre/revenue-periods";
import {
  TAX_REPORT_MONTH_NAMES,
  taxReportSkuPath,
  taxReportSkuPeriodPath,
} from "@/lib/tax-report/routes";
import { margemOperacionalConsolidado } from "@/lib/tax-report/imposto-operacional";
import type { TaxReportPayload } from "@/lib/tax-report/types";
import { cn } from "@/lib/utils";

function formatYmdBr(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

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
  const [mode, setMode] = useState<"month" | "period">("month");
  const [fromDate, setFromDate] = useState(todayYmdLocal);
  const [toDate, setToDate] = useState(todayYmdLocal);
  const [rangePreset, setRangePreset] = useState<"custom" | 7 | 15 | 30>(7);
  const [missingMonths, setMissingMonths] = useState<
    { year: number; month: number }[]
  >([]);
  const [report, setReport] = useState<TaxReportPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [generateProgress, setGenerateProgress] =
    useState<TaxReportProgressState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [fixedCostModalOpen, setFixedCostModalOpen] = useState(false);
  const [fixedCostItems, setFixedCostItems] = useState<TaxFixedCostItemRow[]>([]);
  const [companyTaxRegime, setCompanyTaxRegime] = useState<string | null>(null);
  const isPeriodMode = mode === "period";

  const applyPreset = useCallback((days: 7 | 15 | 30) => {
    const { from, to } = lastDaysYmdRange(days);
    setRangePreset(days);
    setFromDate(from);
    setToDate(to);
  }, []);

  const switchToPeriod = useCallback(() => {
    if (mode === "period") return;
    setMode("period");
    applyPreset(rangePreset === "custom" ? 7 : rangePreset);
  }, [mode, rangePreset, applyPreset]);

  const switchToMonth = useCallback(() => {
    setMode("month");
  }, []);

  const loadFixedCostItems = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/tax-report/fixed-cost-items?year=${year}&month=${month}`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as { items: TaxFixedCostItemRow[] };
      setFixedCostItems(data.items);
    } catch {
      // silencioso — não bloqueia a tela principal do relatório
    }
  }, [year, month]);

  useEffect(() => {
    void loadFixedCostItems();
  }, [loadFixedCostItems]);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMissingMonths([]);
    try {
      const res = await fetch(
        isPeriodMode
          ? `/api/reports/period-tax?from=${fromDate}&to=${toDate}&summary=1`
          : `/api/reports/monthly-tax?year=${year}&month=${month}`,
      );
      if (res.status === 404) {
        setReport(null);
        return;
      }
      if (!res.ok) {
        throw new Error(await readApiError(res, "monthly_tax_load_failed"));
      }
      const data = (await res.json()) as TaxReportPayload & {
        missingMonths?: { year: number; month: number }[];
      };
      setMissingMonths(data.missingMonths ?? []);
      setReport(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar relatório");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [isPeriodMode, year, month, fromDate, toDate]);

  const generateSSE = useSSEStream<
    | ({ type: "progress" } & TaxReportProgressState)
    | { type: "complete" }
    | { type: "error"; message: string }
  >(
    useCallback(
      async (event) => {
        if (event.type === "progress") {
          setGenerateProgress({
            phase: event.phase,
            message: event.message,
            current: event.current,
            total: event.total,
          });
        } else if (event.type === "complete") {
          await loadReport();
          setGenerateProgress({
            phase: "done",
            message: "Relatório gerado com sucesso.",
          });
        } else if (event.type === "error") {
          throw new Error(event.message);
        }
      },
      [loadReport],
    ),
  );
  const generating = generateSSE.streaming;

  useEffect(() => {
    if (generateSSE.error) setError(generateSSE.error);
  }, [generateSSE.error]);

  const generateReport = useCallback(
    async (force: boolean) => {
      setGenerateProgress({
        phase: "orders",
        message: "Iniciando geração do relatório…",
      });
      setError(null);
      await generateSSE.start("/api/reports/monthly-tax", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month, force, stream: true }),
      });
      setTimeout(() => setGenerateProgress(null), 400);
    },
    [year, month, generateSSE],
  );

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/tax-config")
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { company?: { taxRegime?: string } } | null) => {
        if (!cancelled && json?.company?.taxRegime) {
          setCompanyTaxRegime(json.company.taxRegime);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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

  const skuPathFor = useCallback(
    (sku: string) =>
      isPeriodMode
        ? taxReportSkuPeriodPath(fromDate, toDate, sku)
        : taxReportSkuPath(year, month, sku),
    [isPeriodMode, fromDate, toDate, year, month],
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

  if (companyTaxRegime && companyTaxRegime !== "LUCRO_REAL") {
    return (
      <Card className="p-6 text-center">
        <Scale className="mx-auto size-8 text-[var(--muted-foreground)]" aria-hidden />
        <h2 className="mt-3 text-sm font-semibold">
          Relatório Tributário Mensal não disponível para Simples Nacional
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted-foreground)]">
          Esta apuração por venda e SKU (débito/crédito de ICMS, PIS/COFINS) é
          específica do regime Lucro Real. Empresas no Simples pagam um DAS
          único mensal — essa funcionalidade está prevista para uma versão
          futura.
        </p>
      </Card>
    );
  }

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

        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-[var(--border)] bg-[var(--muted)]/10 px-3 py-2">
          <div className="flex rounded-lg border border-[var(--border)] bg-[var(--background)] p-0.5">
            <Button
              type="button"
              size="sm"
              variant={!isPeriodMode ? "default" : "ghost"}
              className="h-8 rounded-md px-3 text-xs"
              disabled={loading || generating}
              onClick={switchToMonth}
            >
              Mês
            </Button>
            <Button
              type="button"
              size="sm"
              variant={isPeriodMode ? "default" : "ghost"}
              className="h-8 rounded-md px-3 text-xs"
              disabled={loading || generating}
              onClick={switchToPeriod}
            >
              Período
            </Button>
          </div>

          {isPeriodMode ? (
            <>
              <div>
                <label className="mb-1 block text-xs text-[var(--muted-foreground)]">
                  Período
                </label>
                <DateRangePicker
                  fromYmd={fromDate}
                  toYmd={toDate}
                  disabled={loading}
                  maxDays={90}
                  onChange={(from, to) => {
                    setRangePreset("custom");
                    setFromDate(from);
                    setToDate(to);
                  }}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant={rangePreset === 7 ? "default" : "outline"}
                  size="sm"
                  className="h-[38px]"
                  disabled={loading}
                  onClick={() => applyPreset(7)}
                >
                  Últimos 7 dias
                </Button>
                <Button
                  type="button"
                  variant={rangePreset === 15 ? "default" : "outline"}
                  size="sm"
                  className="h-[38px]"
                  disabled={loading}
                  onClick={() => applyPreset(15)}
                >
                  Últimos 15 dias
                </Button>
                <Button
                  type="button"
                  variant={rangePreset === 30 ? "default" : "outline"}
                  size="sm"
                  className="h-[38px]"
                  disabled={loading}
                  onClick={() => applyPreset(30)}
                >
                  Últimos 30 dias
                </Button>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={() => void loadReport()}
              >
                <RefreshCw className={cn("mr-2 size-4", loading && "animate-spin")} />
                Atualizar
              </Button>
            </>
          ) : (
            <>
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
              <Button
                type="button"
                variant="outline"
                onClick={() => setFixedCostModalOpen(true)}
              >
                <Wallet className="mr-2 size-4" />
                Custos fixos
              </Button>
            </>
          )}
        </div>

        {!isPeriodMode ? (
          <TaxFixedCostsModal
            open={fixedCostModalOpen}
            year={year}
            month={month}
            items={fixedCostItems}
            onClose={() => setFixedCostModalOpen(false)}
            onChanged={() => {
              void loadFixedCostItems();
            }}
          />
        ) : null}

        {error ? (
          <UserFeedback title="Não foi possível carregar o relatório">
            {error}
          </UserFeedback>
        ) : null}

        {isPeriodMode && missingMonths.length > 0 ? (
          <UserFeedback tone="warning" title="Período incompleto">
            Sem relatório gerado para{" "}
            {missingMonths
              .map((m) => `${TAX_REPORT_MONTH_NAMES[m.month - 1]}/${m.year}`)
              .join(", ")}
            . Parte do período pode estar incompleta — gere esses meses no modo
            “Mês”.
          </UserFeedback>
        ) : null}

        {!report && !loading && !generating && !error ? (
          <Card className="p-6 text-center text-sm text-[var(--muted-foreground)]">
            {isPeriodMode
              ? "Nenhum dado encontrado para o período selecionado."
              : <>
                  Nenhum snapshot salvo para {TAX_REPORT_MONTH_NAMES[month - 1]}/
                  {year}. Clique em &quot;Gerar relatório&quot; para buscar pedidos no
                  Mercado Livre.
                </>}
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
                label="Margem operacional"
                value={formatFinancialMoney(
                  margemOperacionalConsolidado(report.consolidado),
                )}
                tip="Faturamento − CMV − impostos operacionais (PIS/COFINS + ICMS) do mês."
                highlight
              />
            </div>

            {report.consolidado.apuracao ? (
              <TaxReportApuracaoPanel
                apuracao={report.consolidado.apuracao}
                faturamento={report.consolidado.faturamento}
              />
            ) : null}

            {report.consolidado.creditoCustosFixosTotal ? (
              <Card className="p-4 text-sm">
                <p className="font-medium text-[var(--foreground)]">
                  Crédito de custos fixos (aluguel etc.) já incluído na margem
                </p>
                <p className="mt-1 text-[var(--muted-foreground)]">
                  {!isPeriodMode &&
                  report.consolidado.creditoCustosFixosBaseCreditavel !=
                    report.consolidado.creditoCustosFixosBaseRegistrada ? (
                    <>
                      Mês em andamento: base rateada{" "}
                      {formatFinancialMoney(
                        report.consolidado.creditoCustosFixosBaseCreditavel ?? 0,
                      )}{" "}
                      de{" "}
                      {formatFinancialMoney(
                        report.consolidado.creditoCustosFixosBaseRegistrada ?? 0,
                      )}{" "}
                      cadastrados ×{" "}
                    </>
                  ) : !isPeriodMode ? (
                    <>
                      Base cadastrada{" "}
                      {formatFinancialMoney(
                        report.consolidado.creditoCustosFixosBaseRegistrada ?? 0,
                      )}{" "}
                      ×{" "}
                    </>
                  ) : null}
                  9,25% ={" "}
                  <strong>
                    {formatFinancialMoney(
                      report.consolidado.creditoCustosFixosTotal,
                    )}
                  </strong>
                </p>
              </Card>
            ) : null}

            <p className="text-xs text-[var(--muted-foreground)]">
              {report.periodFrom && report.periodTo ? (
                <>
                  Período: {formatYmdBr(report.periodFrom)} –{" "}
                  {formatYmdBr(report.periodTo)}{" "}
                </>
              ) : (
                <>
                  Gerado em{" "}
                  {new Date(report.meta.geradoEm).toLocaleString("pt-BR")}{" "}
                </>
              )}
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
              <TaxReportSkuTable
                rows={filteredSkuRows}
                searchQuery={searchQuery}
                totalCount={report.porSku.length}
                skuPathFor={skuPathFor}
              />
            </Card>
          </>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
