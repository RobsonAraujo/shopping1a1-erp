"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { FileSearch, Info, RefreshCw, Scale, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { UserFeedback } from "@/components/ui/user-feedback";
import { FormSelect } from "@/components/ui/form-select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  TaxFixedCostsModal,
  type TaxFixedCostItemRow,
} from "@/components/relatorio-tributario/TaxFixedCostsModal";
import {
  TaxReportGenerationOverlay,
  type TaxReportProgressState,
} from "@/components/relatorio-tributario/TaxReportGenerationOverlay";
import { TaxReportSkuTable } from "@/components/relatorio-tributario/tax-report-sku-table";
import { ItemListSearch } from "@/components/shared/ItemListSearch";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { readApiError } from "@/lib/api/api-client-error";
import { useSSEStream } from "@/hooks/use-sse-stream";
import { lastDaysYmdRange, todayYmdLocal } from "@/lib/date-range";
import { formatFinancialMoney } from "@/lib/pricing/financial-margin";
import { filterByItemListSearch } from "@/lib/item-list-search";
import { getZonedYearMonth } from "@/lib/mercadolibre/revenue-periods";
import {
  TAX_REPORT_MONTH_NAMES,
  taxReportSkuPath,
  taxReportSkuPeriodPath,
} from "@/lib/tax-report/routes";
import type { TaxReportPayload } from "@/lib/tax-report/types";
import { cn } from "@/lib/utils";

function formatYmdBr(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

function MetaChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--background)] px-2.5 py-0.5 text-xs text-[var(--muted-foreground)] tabular-nums">
      {children}
    </span>
  );
}

export function MonthlyTaxReportClient({
  initialYear,
  initialMonth,
  initialCompanyTaxRegime,
  initialFixedCostItems,
  initialReport,
}: {
  initialYear: number;
  initialMonth: number;
  initialCompanyTaxRegime: string | null;
  initialFixedCostItems: TaxFixedCostItemRow[];
  initialReport: TaxReportPayload | null;
}) {
  const now = getZonedYearMonth();
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [mode, setMode] = useState<"month" | "period">("month");
  const [fromDate, setFromDate] = useState(todayYmdLocal);
  const [toDate, setToDate] = useState(todayYmdLocal);
  const [rangePreset, setRangePreset] = useState<"custom" | 7 | 15 | 30>(7);
  const [missingMonths, setMissingMonths] = useState<
    { year: number; month: number }[]
  >([]);
  const [report, setReport] = useState<TaxReportPayload | null>(initialReport);
  const [loading, setLoading] = useState(false);
  const [generateProgress, setGenerateProgress] =
    useState<TaxReportProgressState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [fixedCostModalOpen, setFixedCostModalOpen] = useState(false);
  const [fixedCostItems, setFixedCostItems] =
    useState<TaxFixedCostItemRow[]>(initialFixedCostItems);
  const [companyTaxRegime] = useState<string | null>(initialCompanyTaxRegime);
  const isPeriodMode = mode === "period";
  const skipNextFixedCostFetch = useRef(true);
  const skipNextReportFetch = useRef(true);

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
    // O ano/mês inicial já chega via prop (carregado no servidor) — só refaz
    // a busca quando o usuário troca o período.
    if (skipNextFixedCostFetch.current) {
      skipNextFixedCostFetch.current = false;
      return;
    }
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
    async () => {
      setGenerateProgress({
        phase: "orders",
        message: "Iniciando geração do relatório…",
      });
      setError(null);
      await generateSSE.start("/api/reports/monthly-tax", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month, force: true, stream: true }),
      });
      setTimeout(() => setGenerateProgress(null), 400);
    },
    [year, month, generateSSE],
  );

  useEffect(() => {
    // Idem: relatório do ano/mês inicial já vem via prop.
    if (skipNextReportFetch.current) {
      skipNextReportFetch.current = false;
      return;
    }
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

  const periodLabel =
    report?.periodFrom && report.periodTo
      ? `${formatYmdBr(report.periodFrom)} – ${formatYmdBr(report.periodTo)}`
      : report
        ? `${TAX_REPORT_MONTH_NAMES[report.month - 1]}/${report.year}`
        : "";
  const fixedCostProrated =
    report?.consolidado.creditoCustosFixosBaseCreditavel !=
    report?.consolidado.creditoCustosFixosBaseRegistrada;

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
                onClick={() => void generateReport()}
              >
                <RefreshCw className={cn("mr-2 size-4", generating && "animate-spin")} />
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
            . Parte do período pode estar incompleta — calcule esses meses no
            modo “Mês” com o botão Recalcular.
          </UserFeedback>
        ) : null}

        {!report && !loading && !generating && !error ? (
          <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-[var(--primary)]/10 text-[var(--primary)]">
              <FileSearch className="size-5" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold">
                {isPeriodMode
                  ? "Nenhum dado no período"
                  : `${TAX_REPORT_MONTH_NAMES[month - 1]}/${year} ainda não calculado`}
              </p>
              <p className="mx-auto mt-1 max-w-md text-sm text-[var(--muted-foreground)]">
                {isPeriodMode
                  ? "Calcule os meses deste período no modo “Mês” (botão Recalcular) para vê-los aqui."
                  : "O Recalcular busca do zero os pedidos pagos no Mercado Livre e calcula os impostos venda a venda."}
              </p>
            </div>
            {!isPeriodMode ? (
              <Button type="button" onClick={() => void generateReport()}>
                <RefreshCw className="mr-2 size-4" />
                Recalcular
              </Button>
            ) : null}
          </Card>
        ) : null}

        {report ? (
          <>
            <Card className="overflow-hidden p-0">
              <div className="grid gap-0 md:grid-cols-[1fr_auto]">
                <div className="p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                      Faturamento
                    </p>
                    <Badge variant="muted">{periodLabel}</Badge>
                  </div>
                  <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
                    {formatFinancialMoney(report.consolidado.faturamento)}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                    Receita bruta das vendas pagas incluídas na apuração
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <MetaChip>
                      {report.meta.pedidosProcessados.toLocaleString("pt-BR")} pedidos
                    </MetaChip>
                    <MetaChip>
                      {report.porSku.length.toLocaleString("pt-BR")} SKUs
                    </MetaChip>
                    <MetaChip>Origem {report.meta.originUf}</MetaChip>
                    {report.meta.semBillingInfo > 0 ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="rounded-md">
                            <Badge variant="warning" dot>
                              {report.meta.semBillingInfo} sem dados do comprador
                            </Badge>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          Pedidos sem billing_info no Mercado Livre: UF de
                          destino e tipo de comprador foram estimados.
                        </TooltipContent>
                      </Tooltip>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-col justify-between gap-3 border-t border-[var(--border)] bg-[var(--muted)]/25 p-5 md:min-w-[17rem] md:border-t-0 md:border-l">
                  <div>
                    <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                      <Wallet className="size-3.5" aria-hidden />
                      Crédito de custos fixos
                    </p>
                    {report.consolidado.creditoCustosFixosTotal ? (
                      <>
                        <p className="mt-1 text-xl font-semibold tabular-nums text-emerald-800 dark:text-emerald-300">
                          {formatFinancialMoney(
                            report.consolidado.creditoCustosFixosTotal,
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                          {!isPeriodMode && fixedCostProrated ? (
                            <>
                              Mês em andamento: base rateada{" "}
                              {formatFinancialMoney(
                                report.consolidado.creditoCustosFixosBaseCreditavel ?? 0,
                              )}{" "}
                              de{" "}
                              {formatFinancialMoney(
                                report.consolidado.creditoCustosFixosBaseRegistrada ?? 0,
                              )}{" "}
                              × 9,25%
                            </>
                          ) : !isPeriodMode ? (
                            <>
                              Base{" "}
                              {formatFinancialMoney(
                                report.consolidado.creditoCustosFixosBaseRegistrada ?? 0,
                              )}{" "}
                              × 9,25% · já incluído na margem
                            </>
                          ) : (
                            "Soma dos meses do período · já incluído na margem"
                          )}
                        </p>
                      </>
                    ) : (
                      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                        Nenhum custo fixo com crédito
                        {isPeriodMode ? " no período." : " neste mês."}
                      </p>
                    )}
                  </div>
                  {!isPeriodMode ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="self-start"
                      onClick={() => setFixedCostModalOpen(true)}
                    >
                      {report.consolidado.creditoCustosFixosTotal
                        ? "Gerenciar custos fixos"
                        : "Adicionar custos fixos"}
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="flex items-start gap-2 border-t border-[var(--border)] px-5 py-2.5 text-xs text-[var(--muted-foreground)]">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <p>
                  Estimativa gerencial (Lucro Real), calculada venda a venda com
                  UF de destino e tipo de comprador. Não substitui a apuração
                  contábil oficial (LALUR/e-Lalur).{" "}
                  {report.periodFrom && report.periodTo ? null : (
                    <>
                      Gerado em{" "}
                      {new Date(report.meta.geradoEm).toLocaleString("pt-BR")}.
                    </>
                  )}
                </p>
              </div>
            </Card>

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
