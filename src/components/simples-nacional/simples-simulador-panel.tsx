"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormSelect } from "@/components/ui/form-select";
import { UserFeedback } from "@/components/ui/user-feedback";
import {
  TaxReportGenerationOverlay,
  type TaxReportProgressState,
} from "@/components/relatorio-tributario/tax-report-generation-overlay";
import { SimplesSimuladorSkuTable } from "@/components/simples-nacional/simples-simulador-sku-table";
import { readApiError } from "@/lib/api-client-error";
import { useSSEStream } from "@/hooks/use-sse-stream";
import { getZonedYearMonth } from "@/lib/mercadolibre/revenue-periods";
import { TAX_REPORT_MONTH_NAMES } from "@/lib/tax-report/routes";
import type { SimulacaoComparacao } from "@/lib/simples-nacional/types";

export function SimplesSimuladorPanel() {
  const now = getZonedYearMonth();
  const [year, setYear] = useState(now.year);
  const [month, setMonth] = useState(now.month);
  const [comparacao, setComparacao] = useState<SimulacaoComparacao | null>(null);
  const [loading, setLoading] = useState(false);
  const [generateProgress, setGenerateProgress] =
    useState<TaxReportProgressState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadExisting = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/reports/simples-nacional/simulacao?year=${year}&month=${month}`,
      );
      if (res.status === 404) {
        setComparacao(null);
        return;
      }
      if (!res.ok) {
        throw new Error(await readApiError(res, "simulacao_load_failed"));
      }
      const data = (await res.json()) as { comparacao: SimulacaoComparacao };
      setComparacao(data.comparacao);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar simulação");
      setComparacao(null);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    void loadExisting();
  }, [loadExisting]);

  const generateSSE = useSSEStream<
    | ({ type: "progress" } & TaxReportProgressState)
    | { type: "complete"; comparacao: SimulacaoComparacao }
    | { type: "error"; message: string }
  >(
    useCallback((event) => {
      if (event.type === "progress") {
        setGenerateProgress({
          phase: event.phase,
          message: event.message,
          current: event.current,
          total: event.total,
        });
      } else if (event.type === "complete") {
        setComparacao(event.comparacao);
        setGenerateProgress({ phase: "done", message: "Simulação concluída." });
      } else if (event.type === "error") {
        throw new Error(event.message);
      }
    }, []),
  );
  const generating = generateSSE.streaming;

  useEffect(() => {
    if (generateSSE.error) setError(generateSSE.error);
  }, [generateSSE.error]);

  const simulate = useCallback(
    async (force: boolean) => {
      setGenerateProgress({
        phase: "orders",
        message: "Iniciando simulação…",
      });
      setError(null);
      await generateSSE.start("/api/reports/simples-nacional/simulacao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month, force, stream: true }),
      });
      setTimeout(() => setGenerateProgress(null), 400);
    },
    [year, month, generateSSE],
  );

  const years = useMemo(() => {
    const current = now.year;
    return [current - 1, current, current + 1];
  }, [now.year]);

  const yearOptions = useMemo(
    () => years.map((y) => ({ value: String(y), label: String(y) })),
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

  return (
    <Card className="p-4">
      {generating && generateProgress ? (
        <TaxReportGenerationOverlay progress={generateProgress} />
      ) : null}

      <h2 className="text-sm font-semibold">Simulador Simples x Lucro Real</h2>
      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
        Descubra quanto de imposto por anúncio você pagaria se mudasse para o
        Lucro Real — rodamos o mesmo motor de cálculo da apuração real sobre
        as vendas do mês, só para comparar. Não altera o regime tributário da
        empresa nem gera nenhuma obrigação.
      </p>

      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
        <p className="font-medium">Comparação parcial</p>
        <p className="mt-1 leading-relaxed">
          O simulador calcula só PIS/COFINS e ICMS/DIFAL (tributos
          operacionais) — o motor de Lucro Real deste ERP não apura IRPJ/CSLL.
          O DAS do Simples embute IRPJ, CSLL, CPP, ICMS, PIS e COFINS. Também
          não credita ICMS-ST recuperável (Tema 201/STF): é uma tese que
          exige levantamento próprio, que sua empresa nunca precisou fazer por
          sempre ter sido Simples. Use como apoio gerencial, não como decisão
          definitiva de troca de regime.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <FormSelect
          id="simulador-year"
          label="Ano"
          value={String(year)}
          onValueChange={(value) => setYear(Number(value))}
          options={yearOptions}
          disabled={generating}
          triggerClassName="w-[7.5rem]"
        />
        <FormSelect
          id="simulador-month"
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
          onClick={() => void simulate(false)}
        >
          Simular
        </Button>
        {comparacao ? (
          <Button
            type="button"
            variant="outline"
            disabled={loading || generating}
            onClick={() => void simulate(true)}
          >
            <RefreshCw className="mr-2 size-4" />
            Recalcular
          </Button>
        ) : null}
      </div>

      {error ? (
        <UserFeedback title="Não foi possível simular" className="mt-4">
          {error}
        </UserFeedback>
      ) : null}

      {!comparacao && !loading && !generating && !error ? (
        <p className="mt-4 text-sm text-[var(--muted-foreground)]">
          Nenhuma simulação salva para{" "}
          {TAX_REPORT_MONTH_NAMES[month - 1]}/{year}. Clique em &quot;Simular&quot;
          para processar as vendas do mês.
        </p>
      ) : null}

      {comparacao ? (
        <div className="mt-4">
          <SimplesSimuladorSkuTable comparacao={comparacao} />
        </div>
      ) : null}
    </Card>
  );
}
