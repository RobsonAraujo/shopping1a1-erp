"use client";

import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { toast } from "sonner";
import { dreFollowUpMessage } from "@/components/relatorio-tributario/TaxReportStatusPanel";
import type { TaxRecalcKind } from "@/components/relatorio-tributario/TaxRecalcConfirmDialog";
import type { TaxReportProgressState } from "@/components/relatorio-tributario/TaxReportGenerationOverlay";
import { useTaxRecalcConfirm } from "@/components/relatorio-tributario/use-tax-recalc-confirm";
import type { DreTaxAction } from "@/components/dre/DreYearTableShared";
import { consumeSSEStream } from "@/hooks/use-sse-stream";
import { formatApiErrorMessage, readApiError } from "@/lib/api/api-client-error";
import { dreMonthShortLabel } from "@/lib/dre/dre-table-rows";
import type { DreYearView } from "@/lib/dre/dre-year-data";
import type { TaxReportDreFollowUp } from "@/lib/tax-report/types";

type TaxReportSseEvent =
  | ({ type: "progress" } & Omit<TaxReportProgressState, "phase"> & {
      phase: TaxReportProgressState["phase"];
    })
  | { type: "complete"; dreFollowUp?: TaxReportDreFollowUp }
  | { type: "error"; message: string };

/**
 * O que está rodando agora — a tela fica bloqueada com o andamento até
 * terminar (o usuário vê o que acontece e não mexe no mês no meio).
 */
export type DreTaxOperation =
  /** Tributário recalculado buscando os pedidos no ML (pode levar minutos). */
  | { kind: "regenerate"; month: number; progress: TaxReportProgressState }
  /** Tributário recalculado com as vendas salvas (segundos). */
  | { kind: "recompute"; months: number[]; current: number }
  /** Só o imposto do DRE, com o tributário salvo (segundos). */
  | { kind: "refresh"; month: number };

/**
 * Ações que mantêm o imposto do DRE junto do relatório tributário:
 * - `refresh`: troca só o % (auditoria salva, sem ML);
 * - `recompute_report`: recalcula o tributário com as vendas salvas (sem ML);
 * - `regenerate_report`: recalcula o tributário buscando os pedidos no ML
 *   (mês fechado com o tributário buscado antes do fechamento, ou sem tributário).
 * Nos dois recálculos do tributário o servidor já atualiza o imposto do DRE.
 * Uma operação por vez, com a tela bloqueada (`taxOperation`).
 */
export function useDreTaxActions({
  year,
  setData,
  loadYear,
  setError,
  requestSyncMonth,
}: {
  year: number;
  setData: Dispatch<SetStateAction<DreYearView | null>>;
  loadYear: (targetYear: number) => Promise<void>;
  setError: (message: string | null) => void;
  requestSyncMonth: (month: number) => void;
}) {
  const [taxOperation, setTaxOperation] = useState<DreTaxOperation | null>(null);
  /** Só a geração completa (SSE) pode ser cancelada. */
  const abortRef = useRef<AbortController | null>(null);

  const notify = useCallback(
    (month: number, followUp: TaxReportDreFollowUp | undefined) => {
      const message = dreFollowUpMessage(
        followUp,
        dreMonthShortLabel(month).toLowerCase(),
      );
      if (!message) return;
      if (message.tone === "success") toast.success(message.text);
      else if (message.tone === "warning") toast.warning(message.text);
      else toast(message.text);
    },
    [],
  );

  const refreshTax = useCallback(
    async (month: number) => {
      setTaxOperation({ kind: "refresh", month });
      try {
        const res = await fetch("/api/dre/tax/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ year, month }),
        });
        if (!res.ok) {
          setError(await readApiError(res, "dre_tax_refresh_failed"));
          return;
        }
        const data = (await res.json()) as {
          result: TaxReportDreFollowUp;
          yearView: DreYearView;
        };
        setData((prev) =>
          prev && prev.year !== data.yearView.year ? prev : data.yearView,
        );
        notify(month, data.result);
      } catch {
        setError("Falha de rede ao atualizar o imposto. Verifique sua conexão.");
      } finally {
        setTaxOperation(null);
      }
    },
    [year, setData, setError, notify],
  );

  /** Um mês, sem mexer no overlay (quem chama controla). `true` = deu certo. */
  const recomputeOne = useCallback(
    async (month: number): Promise<boolean> => {
      try {
        const res = await fetch("/api/reports/monthly-tax", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ year, month, mode: "recompute" }),
        });
        if (!res.ok) {
          setError(await readApiError(res, "monthly_tax_generate_failed"));
          return false;
        }
        const data = (await res.json()) as { dreFollowUp?: TaxReportDreFollowUp };
        notify(month, data.dreFollowUp);
        return true;
      } catch {
        setError("Falha de rede ao recalcular o tributário. Verifique sua conexão.");
        return false;
      }
    },
    [year, setError, notify],
  );

  /** Recálculo rápido do tributário de um ou vários meses (nivelamento). */
  const recomputeReports = useCallback(
    async (months: number[]) => {
      const ordered = [...new Set(months)].sort((a, b) => a - b);
      if (ordered.length === 0) return;
      try {
        for (const month of ordered) {
          setTaxOperation({ kind: "recompute", months: ordered, current: month });
          const ok = await recomputeOne(month);
          if (!ok) break;
        }
        await loadYear(year);
      } finally {
        setTaxOperation(null);
      }
    },
    [recomputeOne, loadYear, year],
  );

  const regenerateReport = useCallback(
    async (month: number) => {
      const controller = new AbortController();
      abortRef.current = controller;
      setTaxOperation({
        kind: "regenerate",
        month,
        progress: { phase: "orders", message: "Conectando ao Mercado Livre…" },
      });
      try {
        const res = await fetch("/api/reports/monthly-tax", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ year, month, force: true, stream: true }),
          signal: controller.signal,
        });
        if (!res.ok) {
          setError(await readApiError(res, "monthly_tax_generate_failed"));
          return;
        }
        let followUp: TaxReportDreFollowUp | undefined;
        let completed = false;
        await consumeSSEStream<TaxReportSseEvent>(res, (event) => {
          if (event.type === "progress") {
            setTaxOperation({
              kind: "regenerate",
              month,
              progress: {
                phase: event.phase,
                message: event.message,
                current: event.current,
                total: event.total,
              },
            });
          } else if (event.type === "complete") {
            completed = true;
            followUp = event.dreFollowUp;
          } else if (event.type === "error") {
            setError(formatApiErrorMessage(event.message));
          }
        });
        if (!completed) return;
        await loadYear(year);
        notify(month, followUp);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // Cancelado antes de "Salvando": nada foi gravado. Recarrega mesmo
          // assim, para a tela mostrar exatamente o que está no banco.
          toast("Recálculo do tributário cancelado — nada foi alterado.");
          await loadYear(year);
        } else {
          setError("Falha de rede ao recalcular o tributário. Verifique sua conexão.");
        }
      } finally {
        abortRef.current = null;
        setTaxOperation(null);
      }
    },
    [year, loadYear, setError, notify],
  );

  const cancelTaxOperation = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const runConfirmed = useCallback(
    (kind: TaxRecalcKind, months: number[]) => {
      const month = months[0];
      if (month === undefined) return;
      if (kind === "refresh") void refreshTax(month);
      else if (kind === "regenerate") void regenerateReport(month);
      else void recomputeReports(months);
    },
    [refreshTax, regenerateReport, recomputeReports],
  );

  const labelFor = useCallback(
    (month: number) => `${dreMonthShortLabel(month).toLowerCase()}/${year}`,
    [year],
  );
  const { requestConfirm, dialogProps } = useTaxRecalcConfirm({
    year,
    labelFor,
    onConfirmed: runConfirmed,
  });

  /**
   * Ação do status do imposto do mês. Tudo que muda número passa pela prévia
   * (antes → depois) — o sync tem o diálogo próprio.
   */
  const requestTaxAction = useCallback(
    (month: number, action: DreTaxAction) => {
      if (action === "sync") requestSyncMonth(month);
      else if (action === "refresh") requestConfirm("refresh", [month]);
      else if (action === "recompute_report") requestConfirm("recompute", [month]);
      else requestConfirm("regenerate", [month]);
    },
    [requestConfirm, requestSyncMonth],
  );

  /** Depois do nivelamento: prévia dos meses afetados, numa confirmação só. */
  const requestRecomputeReports = useCallback(
    (months: number[]) => requestConfirm("recompute", months),
    [requestConfirm],
  );

  const taxBusyMonths = new Set<number>(
    taxOperation === null
      ? []
      : taxOperation.kind === "recompute"
        ? taxOperation.months
        : [taxOperation.month],
  );

  return {
    taxOperation,
    taxBusyMonths,
    cancelTaxOperation,
    requestTaxAction,
    requestRecomputeReports,
    confirmDialogProps: dialogProps,
    labelFor,
  };
}
