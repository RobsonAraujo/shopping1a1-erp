"use client";

import { useCallback, useEffect, useMemo, useState, Fragment } from "react";
import { Info, RefreshCw, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormSelect } from "@/components/ui/form-select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  TaxReportGenerationOverlay,
  type TaxReportProgressState,
} from "@/components/tax-report-generation-overlay";
import { readApiError } from "@/lib/api-client-error";
import { formatFinancialMoney, formatFinancialPercent } from "@/lib/financial-margin";
import { getZonedYearMonth } from "@/lib/mercadolibre/revenue-periods";
import type {
  DetalhamentoTributario,
  TaxReportPayload,
} from "@/lib/tax-report/types";
import { cn } from "@/lib/utils";

const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function HeaderWithTip({
  label,
  tip,
}: {
  label: string;
  tip: string;
}) {
  return (
    <span className="inline-flex items-center gap-1">
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
        <HeaderWithTip label={label} tip={tip} />
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

function TransactionRow({
  row,
  expanded,
  onToggle,
}: {
  row: DetalhamentoTributario;
  expanded: boolean;
  onToggle: () => void;
}) {
  const t = row.transacao;
  return (
    <>
      <tr
        className={cn(
          "border-b border-[var(--border)] cursor-pointer hover:bg-[var(--muted)]/20",
          !row.incluidoNaApuracao && "bg-amber-50/50",
        )}
        onClick={onToggle}
      >
        <td className="py-2 pr-3 text-xs">{t.orderDate.slice(0, 10)}</td>
        <td className="py-2 pr-3 font-medium">{t.sku}</td>
        <td className="py-2 pr-3">{t.ufDestino ?? "—"}</td>
        <td className="py-2 pr-3">{t.tipoDocumento}</td>
        <td className="py-2 pr-3 text-right tabular-nums">
          {formatFinancialMoney(t.receitaBruta)}
        </td>
        <td className="py-2 pr-3 text-right tabular-nums">
          {formatFinancialMoney(row.pisCofins?.liquido ?? null)}
        </td>
        <td className="py-2 pr-3 text-right tabular-nums">
          {formatFinancialMoney(row.icmsDifal?.icmsTotal ?? null)}
        </td>
        <td className="py-2 pr-3 text-right tabular-nums">
          {formatFinancialMoney(
            (row.irpjCsll?.irpjTotal ?? 0) + (row.irpjCsll?.csll ?? 0),
          )}
        </td>
        <td className="py-2 text-right tabular-nums">
          {formatFinancialMoney(row.margemLiquidaEstimada)}
        </td>
      </tr>
      {expanded ? (
        <tr className="border-b border-[var(--border)] bg-[var(--muted)]/10">
          <td colSpan={9} className="px-3 py-3">
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
          </td>
        </tr>
      ) : null}
    </>
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
  const [filterSku, setFilterSku] = useState("");
  const [filterUf, setFilterUf] = useState("");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [expandedSku, setExpandedSku] = useState<string | null>(null);

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
              | { type: "complete"; payload: TaxReportPayload }
              | { type: "error"; message: string };

            if (data.type === "progress") {
              setGenerateProgress({
                phase: data.phase,
                message: data.message,
                current: data.current,
                total: data.total,
              });
            } else if (data.type === "complete") {
              setReport(data.payload);
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
    [year, month],
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
      MONTH_NAMES.map((name, index) => ({
        value: String(index + 1),
        label: name,
      })),
    [],
  );

  const filteredTransactions = useMemo(() => {
    if (!report) return [];
    return report.transacoes.filter((row) => {
      if (filterSku && !row.transacao.sku.toLowerCase().includes(filterSku.toLowerCase())) {
        return false;
      }
      if (filterUf && row.transacao.ufDestino !== filterUf.toUpperCase()) {
        return false;
      }
      return true;
    });
  }, [report, filterSku, filterUf]);

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

        <Card className="border-sky-200 bg-sky-50/60 p-4 text-sm text-sky-950">
          <p className="font-medium">Verificação de CNPJ contribuinte (CNPJ.ws)</p>
          <p className="mt-1 text-xs leading-relaxed">
            Serviço pago <strong>desligado por padrão</strong>. Quando o ML não
            informa <code className="text-[11px]">taxpayer_type</code>, o sistema
            assume <strong>não-contribuinte</strong> (aplica DIFAL — conservador).
            Para usar a CNPJ.ws no futuro: configure{" "}
            <code className="text-[11px]">CNPJ_WS_API_KEY</code> e{" "}
            <code className="text-[11px]">CONTRIBUTOR_PROVIDER=cnpj_ws</code>.
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
            Nenhum snapshot salvo para {MONTH_NAMES[month - 1]}/{year}. Clique
            em &quot;Gerar relatório&quot; para buscar pedidos no Mercado Livre.
          </Card>
        ) : null}

        {report ? (
          <>
            {report.meta.contributorVerification?.warnings?.length ? (
              <Card className="border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-950">
                <p className="font-medium">Avisos da apuração</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                  {report.meta.contributorVerification.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </Card>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryCard
                label="Faturamento"
                value={formatFinancialMoney(report.consolidado.faturamento)}
                tip="Soma da receita bruta das vendas incluídas na apuração (pedidos pagos)."
              />
              <SummaryCard
                label="PIS/COFINS líquido"
                value={formatFinancialMoney(report.consolidado.pisCofinsLiquido)}
                tip="Débito sobre a venda menos crédito sobre CMV (não-cumulativo). ICMS pode ser excluído da base (RE 574.706)."
              />
              <SummaryCard
                label="ICMS + DIFAL"
                value={formatFinancialMoney(report.consolidado.icmsDifalTotal)}
                tip="Interestadual para contribuintes; interestadual + DIFAL para não-contribuintes (EC 87/2015)."
              />
              <SummaryCard
                label="Margem líquida est."
                value={formatFinancialMoney(report.consolidado.margemLiquida)}
                tip="Faturamento − CMV − impostos − IRPJ/CSLL estimados do mês."
                highlight
              />
            </div>

            <p className="text-xs text-[var(--muted-foreground)]">
              Gerado em {new Date(report.meta.geradoEm).toLocaleString("pt-BR")}{" "}
              · {report.meta.pedidosProcessados} pedidos ·{" "}
              {report.meta.linhasProcessadas} linhas ·{" "}
              {report.meta.semBillingInfo} sem billing_info · UF origem{" "}
              {report.meta.originUf}
            </p>

            <Card className="p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Scale className="size-4" />
                Por SKU
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted-foreground)]">
                      <th className="py-2 pr-3">SKU</th>
                      <th className="py-2 pr-3 text-right">Vendas</th>
                      <th className="py-2 pr-3 text-right">Unidades</th>
                      <th className="py-2 pr-3 text-right">Receita</th>
                      <th className="py-2 pr-3 text-right">Imposto médio</th>
                      <th className="py-2 text-right">% s/ receita</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.porSku.map((row) => (
                      <Fragment key={row.sku}>
                        <tr
                          key={row.sku}
                          className="cursor-pointer border-b border-[var(--border)] hover:bg-[var(--muted)]/20"
                          onClick={() =>
                            setExpandedSku(expandedSku === row.sku ? null : row.sku)
                          }
                        >
                          <td className="py-2 pr-3 font-medium">{row.sku}</td>
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
                            {formatFinancialMoney(row.impostoMedioPorVenda)}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {formatFinancialPercent(row.impostoMedioPercentual)}
                          </td>
                        </tr>
                        {expandedSku === row.sku ? (
                          <tr key={`${row.sku}-detail`}>
                            <td colSpan={6} className="bg-[var(--muted)]/10 px-3 py-2 text-xs">
                              Imposto total do SKU no período:{" "}
                              <span className="font-semibold tabular-nums">
                                {formatFinancialMoney(row.impostoTotal)}
                              </span>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="p-4">
              <div className="mb-3 flex flex-wrap gap-3">
                <input
                  className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                  placeholder="Filtrar SKU"
                  value={filterSku}
                  onChange={(e) => setFilterSku(e.target.value)}
                />
                <input
                  className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                  placeholder="Filtrar UF"
                  value={filterUf}
                  onChange={(e) => setFilterUf(e.target.value)}
                  maxLength={2}
                />
              </div>
              <h2 className="mb-3 text-sm font-semibold">Detalhamento por venda</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[56rem] text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted-foreground)]">
                      <th className="py-2 pr-3">Data</th>
                      <th className="py-2 pr-3">SKU</th>
                      <th className="py-2 pr-3">UF</th>
                      <th className="py-2 pr-3">Doc.</th>
                      <th className="py-2 pr-3 text-right">Receita</th>
                      <th className="py-2 pr-3 text-right">
                        <HeaderWithTip
                          label="PIS/COFINS"
                          tip="Líquido após crédito de CMV."
                        />
                      </th>
                      <th className="py-2 pr-3 text-right">
                        <HeaderWithTip
                          label="ICMS"
                          tip="Interestadual + DIFAL quando aplicável."
                        />
                      </th>
                      <th className="py-2 pr-3 text-right">
                        <HeaderWithTip
                          label="IRPJ+CSLL"
                          tip="Estimativa por venda; adicional IRPJ 10% no consolidado mensal."
                        />
                      </th>
                      <th className="py-2 text-right">Margem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.map((row) => (
                      <TransactionRow
                        key={row.transacao.transactionKey}
                        row={row}
                        expanded={expandedKey === row.transacao.transactionKey}
                        onToggle={() =>
                          setExpandedKey(
                            expandedKey === row.transacao.transactionKey
                              ? null
                              : row.transacao.transactionKey,
                          )
                        }
                      />
                    ))}
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
