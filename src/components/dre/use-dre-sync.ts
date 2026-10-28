"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { consumeSSEStream } from "@/hooks/use-sse-stream";
import { formatApiErrorMessage, readApiError } from "@/lib/api/api-client-error";
import { dreEditableLineLabel } from "@/lib/dre/dre-table-rows";
import {
  monthTaxStatusMessage,
  type DreTaxAction,
} from "@/components/dre/DreYearTableShared";
import type { DreEditableLineKey } from "@/lib/dre/dre-calculations";
import type { DreMonthView, DreYearView } from "@/lib/dre/dre-year-data";
import type { DreSyncProgressPhase } from "@/lib/dre/dre-month-data";
import { isDreMonthSyncable } from "@/lib/mercadolibre/revenue-periods";

/** Teto de sincronizações em paralelo do "re-sync após nivelamento"
 * (`syncAffectedMonths`) — não existe mais um "sincronizar tudo" que
 * sincronizasse os 12 meses de uma vez (removido: arriscado demais rodar em
 * lote sem escopo, sobrescrevendo ajustes manuais do ano inteiro de um só
 * clique). */
const SYNC_CONCURRENCY = 2;

type DreSyncSseEvent =
  | {
      type: "progress";
      phase: DreSyncProgressPhase;
      message: string;
    }
  | {
      type: "complete";
      syncedAt: string;
      year: number;
      yearView: DreYearView;
    }
  | { type: "error"; message: string };

/** Mês pendente de confirmação de sobrescrita (sincronizar um mês que já tem valores salvos). */
export type SyncConfirmState = number | null;

export type SyncAdjustmentItem = {
  id: string;
  month: number;
  monthLabel: string;
  lineKey: DreEditableLineKey;
  lineLabel: string;
  amount: number;
};

function collectSyncAdjustments(
  data: DreYearView,
  month: SyncConfirmState,
): SyncAdjustmentItem[] {
  if (month === null) return [];
  const monthView = data.months.find((m) => m.month === month);
  if (!monthView) return [];

  const items: SyncAdjustmentItem[] = [];
  for (const lineKey of monthView.manuallyEditedLineKeys) {
    const amount =
      lineKey === "adsCost"
        ? -Math.max(0, monthView.adsCost ?? 0)
        : (monthView.lines?.[lineKey] ?? 0);
    items.push({
      id: `${monthView.month}:${lineKey}`,
      month: monthView.month,
      monthLabel: monthView.label,
      lineKey,
      lineLabel: dreEditableLineLabel(lineKey),
      amount,
    });
  }
  return items;
}

/**
 * Motor de sincronização do DRE (sync de um mês, sync-affected concorrência
 * 2, cancelamento, e a camada de "confirmar sobrescrita" com preservação
 * seletiva de ajustes manuais) — extraído de `DreClient.tsx` sem mudar
 * nenhuma lógica, só passando `data`/`setData`/`setSessionAdjustedByMonth`/
 * `loadYear`/`setError` como parâmetros em vez de fechar sobre o estado do
 * componente pai (que continua sendo o dono desse estado — `data` e
 * `sessionAdjustedByMonth` também são escritos por outros fluxos, como edição
 * manual e conciliação).
 *
 * Não existe (de propósito) um "sincronizar todos os meses de uma vez" — só
 * um mês por confirmação, ou o re-sync escopado disparado pelo nivelamento
 * de custo (`syncAffectedMonths`, que só toca os meses realmente afetados).
 *
 * Conciliação: o sync manda `keepReconciliation` e o servidor reaplica os
 * valores da planilha (ver `mergeSyncedSnapshot`). Só o diálogo de confirmação
 * permite descartar; o re-sync do nivelamento sempre mantém.
 */
export function useDreSync({
  year,
  data,
  setData,
  setSessionAdjustedByMonth,
  loadYear,
  setError,
  onRequestReconcile,
  onRequestTaxAction,
}: {
  year: number;
  data: DreYearView | null;
  setData: Dispatch<SetStateAction<DreYearView | null>>;
  setSessionAdjustedByMonth: Dispatch<
    SetStateAction<Record<number, DreEditableLineKey[]>>
  >;
  loadYear: (targetYear: number) => Promise<void>;
  setError: (message: string | null) => void;
  /** Abre a conciliação do mês (ação do toast pós-sync). */
  onRequestReconcile: (month: number) => void;
  /** Resolve o imposto do mês (ação do toast pós-sync: recalcular tributário…). */
  onRequestTaxAction?: (month: number, action: DreTaxAction) => void;
}) {
  const [syncingMonths, setSyncingMonths] = useState<Set<number>>(new Set());
  const [syncingMonthMessages, setSyncingMonthMessages] = useState<
    Record<number, string>
  >({});
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncConfirm, setSyncConfirm] = useState<SyncConfirmState>(null);
  const [preserveAdjustmentIds, setPreserveAdjustmentIds] = useState<
    Set<string>
  >(new Set());
  /** Switch "Manter valores conciliados" do diálogo — liga a cada abertura. */
  const [keepReconciliation, setKeepReconciliation] = useState(true);
  /** Um AbortController por mês em sincronização (sync-affected roda concorrência 2). */
  const syncControllersRef = useRef<Map<number, AbortController>>(new Map());
  /** "Sincronizar de novo" do toast pós-sync (declarado depois de `syncMonth`). */
  const requestSyncRef = useRef<((month: number) => void) | null>(null);

  const syncAdjustments = useMemo(
    () =>
      data && syncConfirm !== null
        ? collectSyncAdjustments(data, syncConfirm)
        : [],
    [data, syncConfirm],
  );

  const syncConfirmMonthView = useMemo<DreMonthView | null>(
    () =>
      syncConfirm === null
        ? null
        : (data?.months.find((m) => m.month === syncConfirm) ?? null),
    [data, syncConfirm],
  );

  useEffect(() => {
    setKeepReconciliation(true);
  }, [syncConfirm]);

  useEffect(() => {
    if (syncConfirm === null) {
      setPreserveAdjustmentIds(new Set());
      return;
    }
    if (!data) return;
    const items = collectSyncAdjustments(data, syncConfirm);
    setPreserveAdjustmentIds(new Set(items.map((item) => item.id)));
  }, [syncConfirm, data]);

  const syncMonth = useCallback(
    async (
      month: number,
      preserveLineKeys: DreEditableLineKey[] = [],
      options: { keepReconciliation?: boolean; notify?: boolean } = {},
    ): Promise<boolean> => {
      const keep = options.keepReconciliation ?? true;
      const notify = options.notify ?? true;
      if (!isDreMonthSyncable(year, month)) {
        return true;
      }

      setSyncingMonths((prev) => new Set(prev).add(month));
      setSyncingMonthMessages((prev) => ({
        ...prev,
        [month]: "Iniciando sincronização…",
      }));
      const controller = new AbortController();
      syncControllersRef.current.set(month, controller);
      try {
        const res = await fetch("/api/dre/sync?stream=1", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            year,
            month,
            preserveLineKeys,
            keepReconciliation: keep,
          }),
          signal: controller.signal,
        });
        if (!res.ok) {
          setError(await readApiError(res, "dre_sync_failed"));
          return false;
        }

        let completed = false;
        await consumeSSEStream<DreSyncSseEvent>(res, (event) => {
          if (event.type === "progress") {
            setSyncingMonthMessages((prev) => ({
              ...prev,
              [month]: event.message,
            }));
            return;
          }
          if (event.type === "error") {
            setError(
              formatApiErrorMessage(event.message || "dre_sync_failed"),
            );
            return;
          }
          if (event.type === "complete") {
            completed = true;
            setData((prev) => {
              if (!prev) {
                return event.yearView;
              }
              if (prev.year !== event.yearView.year) {
                // Usuário trocou de ano enquanto esta sync estava em voo —
                // os dados já carregados são de outro ano, não sobrescrever.
                return prev;
              }
              // Sync-affected (concorrência 2): um yearView antigo não pode
              // sobrescrever mês já atualizado por outra sync em paralelo.
              const prevByMonth = new Map(
                prev.months.map((row) => [row.month, row]),
              );
              const months = event.yearView.months.map((row) => {
                const existing = prevByMonth.get(row.month);
                if (!existing) return row;
                const existingTs = existing.syncedAt
                  ? Date.parse(existing.syncedAt)
                  : 0;
                const nextTs = row.syncedAt ? Date.parse(row.syncedAt) : 0;
                return nextTs >= existingTs ? row : existing;
              });
              return { ...event.yearView, months };
            });
            setSessionAdjustedByMonth((prev) => {
              if (preserveLineKeys.length === 0) {
                if (!(month in prev)) return prev;
                const next = { ...prev };
                delete next[month];
                return next;
              }
              return { ...prev, [month]: [...preserveLineKeys] };
            });
            if (notify) {
              const row = event.yearView.months.find((m) => m.month === month);
              const label = row?.label ?? `Mês ${month}`;
              if (row?.reconciliation.status === "reconciled") {
                toast.success(`${label} sincronizado — conciliação mantida.`);
              } else {
                toast.success(`${label} sincronizado.`, {
                  description:
                    "Concilie com a planilha Por Vendas para fechar o mês.",
                  action: {
                    label: "Conciliar",
                    onClick: () => onRequestReconcile(month),
                  },
                });
              }
              // Linha que veio zerada fora do padrão: quase sempre falha da
              // API do ML — sincronizar de novo costuma resolver.
              if (row && row.zeroLineAnomalies.length > 0) {
                toast.warning(
                  `${row.zeroLineAnomalies
                    .map((anomaly) => dreEditableLineLabel(anomaly.lineKey))
                    .join(", ")} veio zerada em ${label} — fora do padrão dos outros meses.`,
                  {
                    description: "Pode ser falha da API do Mercado Livre.",
                    action: {
                      label: "Sincronizar de novo",
                      onClick: () => requestSyncRef.current?.(month),
                    },
                    duration: 15_000,
                  },
                );
              }
              // Tributário do mês fora de dia (ex.: atualizado antes do
              // fechamento): o imposto do DRE herdaria o problema.
              const taxMessage = row
                ? monthTaxStatusMessage(row, event.yearView.year)
                : null;
              if (
                taxMessage?.action &&
                taxMessage.action !== "refresh" &&
                taxMessage.action !== "sync" &&
                onRequestTaxAction
              ) {
                const action = taxMessage.action;
                toast.warning(taxMessage.text, {
                  action: {
                    label: taxMessage.actionLabel ?? "Resolver",
                    onClick: () => onRequestTaxAction(month, action),
                  },
                  duration: 15_000,
                });
              }
            }
          }
        });

        if (!completed) {
          setError("Sincronização interrompida antes de concluir.");
          return false;
        }
        return true;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setError("Sincronização cancelada.");
        } else {
          setError("Falha de rede ao sincronizar. Verifique sua conexão.");
        }
        return false;
      } finally {
        syncControllersRef.current.delete(month);
        setSyncingMonths((prev) => {
          const next = new Set(prev);
          next.delete(month);
          return next;
        });
        setSyncingMonthMessages((prev) => {
          if (!(month in prev)) return prev;
          const next = { ...prev };
          delete next[month];
          return next;
        });
      }
    },
    [
      year,
      setData,
      setSessionAdjustedByMonth,
      setError,
      onRequestReconcile,
      onRequestTaxAction,
    ],
  );

  const cancelSyncingMonths = useCallback(() => {
    for (const controller of syncControllersRef.current.values()) {
      controller.abort();
    }
  }, []);

  const monthHasSnapshot = useCallback(
    (month: number) => {
      const row = data?.months.find((m) => m.month === month);
      return Boolean(row?.syncedAt || row?.lines);
    },
    [data],
  );

  const requestSyncMonth = useCallback(
    (month: number) => {
      if (!isDreMonthSyncable(year, month)) return;
      if (monthHasSnapshot(month)) {
        setSyncConfirm(month);
        return;
      }
      void syncMonth(month);
    },
    [year, monthHasSnapshot, syncMonth],
  );
  useEffect(() => {
    requestSyncRef.current = requestSyncMonth;
  }, [requestSyncMonth]);

  /**
   * Re-sync após nivelamento: atualiza Custo produto sem preservar edições
   * manuais dessa linha. Mantém sempre a conciliação — Custo produto nunca é
   * linha da planilha, então não há conflito.
   */
  const syncAffectedMonths = useCallback(
    async (months: number[]) => {
      const unique = [...new Set(months)]
        .filter((month) => isDreMonthSyncable(year, month))
        .sort((a, b) => a - b);
      if (unique.length === 0) return;

      setSyncingAll(true);
      setError(null);
      const failures: number[] = [];
      try {
        let cursor = 0;
        async function worker() {
          while (cursor < unique.length) {
            const month = unique[cursor];
            cursor += 1;
            const preserve = (
              data?.months.find((m) => m.month === month)
                ?.manuallyEditedLineKeys ?? []
            ).filter((key) => key !== "productCostErp");
            const ok = await syncMonth(month, preserve, {
              keepReconciliation: true,
              notify: false,
            });
            if (!ok) failures.push(month);
          }
        }
        const workers = Array.from(
          {
            length: Math.min(SYNC_CONCURRENCY, Math.max(unique.length, 1)),
          },
          () => worker(),
        );
        await Promise.all(workers);
        if (failures.length > 0) {
          setError(
            `Falha ao sincronizar ${failures.length} mês(es) afetados pelo nivelamento.`,
          );
        } else {
          await loadYear(year);
          toast.success(
            unique.length === 1
              ? "Mês afetado re-sincronizado com o nivelamento."
              : `${unique.length} meses afetados re-sincronizados com o nivelamento.`,
          );
        }
      } finally {
        setSyncingAll(false);
      }
    },
    [year, data, syncMonth, loadYear, setError],
  );

  const buildPreserveByMonth = useCallback(() => {
    const map = new Map<number, DreEditableLineKey[]>();
    for (const item of syncAdjustments) {
      if (!preserveAdjustmentIds.has(item.id)) continue;
      const list = map.get(item.month) ?? [];
      list.push(item.lineKey);
      map.set(item.month, list);
    }
    return map;
  }, [syncAdjustments, preserveAdjustmentIds]);

  const confirmSyncOverwrite = useCallback(() => {
    const pendingMonth = syncConfirm;
    setSyncConfirm(null);
    if (pendingMonth === null) return;

    const keys = buildPreserveByMonth().get(pendingMonth) ?? [];
    void syncMonth(pendingMonth, keys, { keepReconciliation });
  }, [syncConfirm, syncMonth, buildPreserveByMonth, keepReconciliation]);

  const togglePreserveAdjustment = useCallback((id: string) => {
    setPreserveAdjustmentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return {
    syncingMonths,
    syncingMonthMessages,
    syncingAll,
    syncConfirm,
    setSyncConfirm,
    preserveAdjustmentIds,
    setPreserveAdjustmentIds,
    keepReconciliation,
    setKeepReconciliation,
    syncConfirmMonthView,
    syncAdjustments,
    requestSyncMonth,
    syncAffectedMonths,
    cancelSyncingMonths,
    togglePreserveAdjustment,
    confirmSyncOverwrite,
  };
}
