"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarRange,
  ChevronDown,
  Download,
  FileCheck2,
  FolderPlus,
  HelpCircle,
  Info,
  MousePointerClick,
  Plus,
  RefreshCw,
  Scale,
  Settings2,
  SquarePen,
  Upload,
} from "lucide-react";
import { DreCostItemsModal } from "@/components/dre/DreFixedCostsModal";
import { DreOverview } from "@/components/dre/DreOverview";
import { DreProductCostLevelingModal } from "@/components/dre/DreProductCostLevelingModal";
import { DreSyncOverlay } from "@/components/dre/DreSyncOverlay";
import { DreYearTable } from "@/components/dre/DreYearTable";
import { DreReconciliationModal } from "@/components/dre/DreReconciliationModal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { FormSelect } from "@/components/ui/form-select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { UserFeedback } from "@/components/ui/user-feedback";
import { consumeSSEStream } from "@/hooks/use-sse-stream";
import { formatApiErrorMessage, readApiError } from "@/lib/api/api-client-error";
import {
  formatFinancialMoney,
} from "@/lib/pricing/financial-margin";
import type { DreEditableLineKey } from "@/lib/dre/dre-calculations";
import { downloadDreYearCsv } from "@/lib/dre/dre-export-csv";
import {
  DEFAULT_DRE_VISIBILITY,
  dreEditableLineLabel,
  type DreVisibilitySettings,
} from "@/lib/dre/dre-table-rows";
import type { DreYearView } from "@/lib/dre/dre-year-data";
import type { DreSyncProgressPhase } from "@/lib/dre/dre-month-data";
import {
  getZonedYearMonth,
  isDreMonthSyncable,
} from "@/lib/mercadolibre/revenue-periods";
import { cn } from "@/lib/utils";

const SYNC_ALL_CONCURRENCY = 2;

const HELP_TONE_CLASS: Record<string, string> = {
  primary: "bg-[var(--primary)]/10 text-[var(--primary)]",
  rose: "bg-rose-50 text-rose-600",
  amber: "bg-amber-50 text-amber-600",
  violet: "bg-violet-50 text-violet-600",
  emerald: "bg-emerald-50 text-emerald-600",
};

const HELP_TIPS: Array<{
  icon: typeof MousePointerClick;
  tone: string;
  title: string;
  description: string;
}> = [
  {
    icon: MousePointerClick,
    tone: "primary",
    title: "Um clique",
    description: "no valor abre o detalhamento.",
  },
  {
    icon: SquarePen,
    tone: "violet",
    title: "Dois cliques",
    description: "editam a célula. Enter salva, Esc cancela.",
  },
  {
    icon: CalendarRange,
    tone: "amber",
    title: "Cabeçalho do mês",
    description: "ou as pílulas acima focam aquele período nos cards.",
  },
  {
    icon: FolderPlus,
    tone: "emerald",
    title: "Cadastrar",
    description: "cria o item; o valor entra com dois cliques na tabela.",
  },
  {
    icon: FileCheck2,
    tone: "rose",
    title: "Conciliar ML",
    description:
      "aplica a planilha oficial Por Vendas. Use depois de sincronizar — a API de faturamento pode oscilar.",
  },
];

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

type SyncConfirmState =
  | { mode: "month"; month: number }
  | { mode: "all" }
  | null;

type SyncAdjustmentItem = {
  id: string;
  month: number;
  monthLabel: string;
  lineKey: DreEditableLineKey;
  lineLabel: string;
  amount: number;
};

function collectSyncAdjustments(
  data: DreYearView,
  scope: SyncConfirmState,
): SyncAdjustmentItem[] {
  if (!scope) return [];
  const months =
    scope.mode === "month"
      ? data.months.filter((m) => m.month === scope.month)
      : data.months.filter((m) => isDreMonthSyncable(data.year, m.month));

  const items: SyncAdjustmentItem[] = [];
  for (const month of months) {
    for (const lineKey of month.manuallyEditedLineKeys) {
      const amount =
        lineKey === "adsCost"
          ? -Math.max(0, month.adsCost ?? 0)
          : (month.lines?.[lineKey] ?? 0);
      items.push({
        id: `${month.month}:${lineKey}`,
        month: month.month,
        monthLabel: month.label,
        lineKey,
        lineLabel: dreEditableLineLabel(lineKey),
        amount,
      });
    }
  }
  return items;
}

export function DreClient() {
  const currentYear = useMemo(() => getZonedYearMonth().year, []);
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState<DreYearView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [fixedCostsModalOpen, setFixedCostsModalOpen] = useState(false);
  const [operationalCostsModalOpen, setOperationalCostsModalOpen] =
    useState(false);
  const [investmentCostsModalOpen, setInvestmentCostsModalOpen] =
    useState(false);
  const [nonOperationalOutModalOpen, setNonOperationalOutModalOpen] =
    useState(false);
  const [nonOperationalInModalOpen, setNonOperationalInModalOpen] =
    useState(false);
  const [levelingModalOpen, setLevelingModalOpen] = useState(false);
  const [syncingMonths, setSyncingMonths] = useState<Set<number>>(new Set());
  const [syncingMonthMessages, setSyncingMonthMessages] = useState<
    Record<number, string>
  >({});
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncConfirm, setSyncConfirm] = useState<SyncConfirmState>(null);
  const [preserveAdjustmentIds, setPreserveAdjustmentIds] = useState<
    Set<string>
  >(new Set());
  /** Marca visual "ajustado" + restore — só na sessão atual (some no reload). */
  const [sessionAdjustedByMonth, setSessionAdjustedByMonth] = useState<
    Record<number, DreEditableLineKey[]>
  >({});
  const [helpOpen, setHelpOpen] = useState(false);
  const [cadastroOpen, setCadastroOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [displaySettings, setDisplaySettings] = useState<DreVisibilitySettings>(
    DEFAULT_DRE_VISIBILITY,
  );
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [reconciliationBusy, setReconciliationBusy] = useState(false);
  const [reconcileAfterSync, setReconcileAfterSync] = useState(false);
  /** Um AbortController por mês em sincronização (sync-all roda concorrência 2). */
  const syncControllersRef = useRef<Map<number, AbortController>>(new Map());
  /** true enquanto um "Sincronizar tudo" cancelado não deve puxar o próximo mês da fila. */
  const syncAllCancelledRef = useRef(false);

  const yearOptions = useMemo(
    () =>
      [currentYear - 1, currentYear, currentYear + 1].map((y) => ({
        value: String(y),
        label: String(y),
      })),
    [currentYear],
  );

  const viewData = useMemo((): DreYearView | null => {
    if (!data) return null;
    return {
      ...data,
      months: data.months.map((month) => ({
        ...month,
        manuallyEditedLineKeys: sessionAdjustedByMonth[month.month] ?? [],
      })),
    };
  }, [data, sessionAdjustedByMonth]);

  const syncAdjustments = useMemo(
    () =>
      data && syncConfirm ? collectSyncAdjustments(data, syncConfirm) : [],
    [data, syncConfirm],
  );

  useEffect(() => {
    if (!syncConfirm) {
      setPreserveAdjustmentIds(new Set());
      return;
    }
    if (!data) return;
    const items = collectSyncAdjustments(data, syncConfirm);
    setPreserveAdjustmentIds(new Set(items.map((item) => item.id)));
  }, [syncConfirm, data]);

  const loadYear = useCallback(async (targetYear: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dre?year=${targetYear}`);
      if (!res.ok) {
        setError(await readApiError(res, "dre_load_failed"));
        return;
      }
      setData((await res.json()) as DreYearView);
    } catch {
      setError("Falha de rede ao carregar o DRE. Verifique sua conexão.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadYear(year);
  }, [year, loadYear]);

  useEffect(() => {
    setSelectedMonth(null);
    setSessionAdjustedByMonth({});
  }, [year]);

  // Preferência de exibição por organização — independente do ano, busca 1x.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/dre/display-settings");
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as DreVisibilitySettings;
        if (!cancelled) setDisplaySettings(json);
      } catch {
        // Preferência puramente visual — se falhar, fica no default (tudo visível).
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleDisplaySetting = useCallback(
    (key: keyof DreVisibilitySettings) => {
      setDisplaySettings((prev) => {
        const next = { ...prev, [key]: !prev[key] };
        void fetch("/api/dre/display-settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [key]: next[key] }),
        }).catch(() => {
          // Puramente visual — falha de rede aqui não precisa de banner de erro.
        });
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    if (!error) return;
    const timeout = setTimeout(() => setError(null), 8000);
    return () => clearTimeout(timeout);
  }, [error]);

  const updateSessionAdjustedAfterEdit = useCallback(
    (
      month: number,
      lineKey: DreEditableLineKey,
      yearView: DreYearView,
    ) => {
      const serverKeys =
        yearView.months.find((m) => m.month === month)
          ?.manuallyEditedLineKeys ?? [];
      setSessionAdjustedByMonth((prev) => {
        const nextKeys = new Set(prev[month] ?? []);
        if (serverKeys.includes(lineKey)) nextKeys.add(lineKey);
        else nextKeys.delete(lineKey);
        return { ...prev, [month]: [...nextKeys] };
      });
    },
    [],
  );

  const syncMonth = useCallback(
    async (
      month: number,
      preserveLineKeys: DreEditableLineKey[] = [],
    ): Promise<boolean> => {
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
          body: JSON.stringify({ year, month, preserveLineKeys }),
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
              // Sync-all (concorrência 2): um yearView antigo não pode
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
            setReconcileAfterSync(true);
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
    [year],
  );

  const cancelSyncingMonths = useCallback(() => {
    syncAllCancelledRef.current = true;
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
        setSyncConfirm({ mode: "month", month });
        return;
      }
      void syncMonth(month);
    },
    [year, monthHasSnapshot, syncMonth],
  );

  const syncAllMonths = useCallback(
    async (
      preserveByMonth: Map<number, DreEditableLineKey[]> = new Map(),
    ) => {
      setSyncingAll(true);
      setError(null);
      syncAllCancelledRef.current = false;
      const failures: number[] = [];
      const months: number[] = [];
      for (let month = 1; month <= 12; month += 1) {
        if (!isDreMonthSyncable(year, month)) continue;
        months.push(month);
      }

      try {
        let cursor = 0;
        async function worker() {
          while (cursor < months.length && !syncAllCancelledRef.current) {
            const month = months[cursor];
            cursor += 1;
            const ok = await syncMonth(
              month,
              preserveByMonth.get(month) ?? [],
            );
            if (!ok) failures.push(month);
          }
        }

        const workers = Array.from(
          {
            length: Math.min(SYNC_ALL_CONCURRENCY, Math.max(months.length, 1)),
          },
          () => worker(),
        );
        await Promise.all(workers);

        if (syncAllCancelledRef.current) {
          setError("Sincronização cancelada.");
        } else if (failures.length > 0) {
          setError(
            `Falha ao sincronizar ${failures.length} mês(es), começando por ${failures[0]}. Corrija o erro e tente novamente.`,
          );
        } else {
          // Garante yearTotals consistentes após merges concorrentes.
          await loadYear(year);
        }
      } finally {
        setSyncingAll(false);
      }
    },
    [syncMonth, year, loadYear],
  );

  const requestSyncAll = useCallback(() => {
    const anyExisting = Boolean(
      data?.months.some(
        (m) =>
          isDreMonthSyncable(year, m.month) &&
          Boolean(m.syncedAt || m.lines),
      ),
    );
    if (anyExisting) {
      setSyncConfirm({ mode: "all" });
      return;
    }
    void syncAllMonths();
  }, [data, year, syncAllMonths]);

  /** Re-sync após nivelamento: atualiza Custo produto sem preservar edições manuais dessa linha. */
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
            const ok = await syncMonth(month, preserve);
            if (!ok) failures.push(month);
          }
        }
        const workers = Array.from(
          {
            length: Math.min(SYNC_ALL_CONCURRENCY, Math.max(unique.length, 1)),
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
        }
      } finally {
        setSyncingAll(false);
      }
    },
    [year, data, syncMonth, loadYear],
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

  const confirmSyncOverwrite = useCallback(
    (preserveSelected: boolean) => {
      const pending = syncConfirm;
      setSyncConfirm(null);
      if (!pending) return;

      if (pending.mode === "month") {
        const keys = preserveSelected
          ? (buildPreserveByMonth().get(pending.month) ?? [])
          : [];
        void syncMonth(pending.month, keys);
        return;
      }

      void syncAllMonths(preserveSelected ? buildPreserveByMonth() : new Map());
    },
    [syncConfirm, syncMonth, syncAllMonths, buildPreserveByMonth],
  );

  const togglePreserveAdjustment = useCallback((id: string) => {
    setPreserveAdjustmentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleManualCostChange = useCallback(
    async (costItemId: string, month: number, amount: number | null) => {
      setError(null);
      try {
        const res = await fetch("/api/dre/cost-values", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ costItemId, year, month, amount }),
        });
        if (!res.ok) {
          setError(await readApiError(res, "dre_cost_value_failed"));
          return;
        }
        const json = (await res.json()) as { year?: DreYearView };
        if (json.year) {
          setData(json.year);
        }
      } catch {
        setError("Falha de rede ao salvar o valor.");
      }
    },
    [year],
  );

  const handleLineChange = useCallback(
    async (lineKey: DreEditableLineKey, month: number, amount: number) => {
      setError(null);
      try {
        const res = await fetch("/api/dre/lines", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ year, month, lineKey, amount }),
        });
        if (!res.ok) {
          setError(await readApiError(res, "dre_line_patch_failed"));
          return;
        }
        const json = (await res.json()) as { year?: DreYearView };
        if (json.year) {
          setData(json.year);
          updateSessionAdjustedAfterEdit(month, lineKey, json.year);
        }
      } catch {
        setError("Falha de rede ao salvar o valor.");
      }
    },
    [year, updateSessionAdjustedAfterEdit],
  );

  const handleLineRestore = useCallback(
    async (lineKey: DreEditableLineKey, month: number) => {
      setError(null);
      try {
        const res = await fetch("/api/dre/lines", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            year,
            month,
            lineKey,
            action: "restore",
          }),
        });
        if (!res.ok) {
          setError(await readApiError(res, "dre_line_patch_failed"));
          return;
        }
        const json = (await res.json()) as { year?: DreYearView };
        if (json.year) {
          setData(json.year);
          setSessionAdjustedByMonth((prev) => ({
            ...prev,
            [month]: (prev[month] ?? []).filter((key) => key !== lineKey),
          }));
        }
      } catch {
        setError("Falha de rede ao restaurar o valor.");
      }
    },
    [year],
  );

  const handleReconciliationApplied = useCallback(
    (
      yearView: DreYearView,
      acceptedLineKeys: DreEditableLineKey[],
      appliedMonth: number,
    ) => {
      setData(yearView);
      setSessionAdjustedByMonth((prev) => ({
        ...prev,
        [appliedMonth]: acceptedLineKeys,
      }));
    },
    [],
  );

  const handleCommitReconciliation = useCallback(
    async (importId: string) => {
      setReconciliationBusy(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/dre/reconciliation/${importId}/commit`,
          { method: "POST" },
        );
        if (!res.ok) {
          setError(await readApiError(res, "dre_reconciliation_commit_failed"));
          return;
        }
        const json = (await res.json()) as { year?: DreYearView };
        if (json.year) {
          setData(json.year);
          if (selectedMonth !== null) {
            setSessionAdjustedByMonth((prev) => ({
              ...prev,
              [selectedMonth]: [],
            }));
          }
        }
      } finally {
        setReconciliationBusy(false);
      }
    },
    [selectedMonth],
  );

  const handleDiscardReconciliation = useCallback(
    async (importId: string) => {
      setReconciliationBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/dre/reconciliation/${importId}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          setError(
            await readApiError(res, "dre_reconciliation_discard_failed"),
          );
          return;
        }
        const json = (await res.json()) as { year?: DreYearView };
        if (json.year) {
          setData(json.year);
          if (selectedMonth !== null) {
            setSessionAdjustedByMonth((prev) => ({
              ...prev,
              [selectedMonth]: [],
            }));
          }
        }
      } finally {
        setReconciliationBusy(false);
      }
    },
    [selectedMonth],
  );

  const syncConfirmMonthLabel =
    syncConfirm?.mode === "month"
      ? (data?.months.find((m) => m.month === syncConfirm.month)?.label ??
        `mês ${syncConfirm.month}`)
      : null;

  return (
    <TooltipProvider delayDuration={200}>
      {syncingMonths.size > 0 ? (
        <DreSyncOverlay
          year={year}
          syncingAll={syncingAll}
          items={[...syncingMonths]
            .sort((a, b) => a - b)
            .map((month) => ({
              month,
              message: syncingMonthMessages[month] ?? "Sincronizando…",
            }))}
          onCancel={cancelSyncingMonths}
        />
      ) : null}
      <div className="space-y-5 [&_button]:cursor-pointer [&_a]:cursor-pointer [&_[role=button]]:cursor-pointer [&_label]:cursor-pointer">
        <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap items-end gap-2">
            <FormSelect
              id="dre-year"
              label="Ano"
              value={String(year)}
              onValueChange={(value) => setYear(Number(value))}
              options={yearOptions}
              triggerClassName="h-10 w-[7rem] rounded-xl text-sm"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-10 gap-1.5 rounded-xl text-xs"
              onClick={() => setHelpOpen((open) => !open)}
            >
              <HelpCircle className="size-3.5" aria-hidden />
              Como usar
            </Button>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Popover open={cadastroOpen} onOpenChange={setCadastroOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 gap-1.5 rounded-xl"
                >
                  <Plus className="size-3.5" aria-hidden />
                  Cadastrar
                  <ChevronDown className="size-3.5 opacity-60" aria-hidden />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-1.5" align="end">
                <div className="flex flex-col">
                  <button
                    type="button"
                    className="cursor-pointer rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--muted)]"
                    onClick={() => {
                      setCadastroOpen(false);
                      setOperationalCostsModalOpen(true);
                    }}
                  >
                    Custos operacionais
                  </button>
                  <button
                    type="button"
                    className="cursor-pointer rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--muted)]"
                    onClick={() => {
                      setCadastroOpen(false);
                      setFixedCostsModalOpen(true);
                    }}
                  >
                    Custos fixos
                  </button>
                  <button
                    type="button"
                    className="cursor-pointer rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--muted)]"
                    onClick={() => {
                      setCadastroOpen(false);
                      setInvestmentCostsModalOpen(true);
                    }}
                  >
                    Investimentos
                  </button>
                  <div className="my-1 border-t border-[var(--border)]" />
                  <p className="px-3 pb-1 pt-0.5 text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                    Despesas não operacionais
                  </p>
                  <button
                    type="button"
                    className="cursor-pointer rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--muted)]"
                    onClick={() => {
                      setCadastroOpen(false);
                      setNonOperationalOutModalOpen(true);
                    }}
                  >
                    Saídas não operacionais
                  </button>
                  <button
                    type="button"
                    className="cursor-pointer rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--muted)]"
                    onClick={() => {
                      setCadastroOpen(false);
                      setNonOperationalInModalOpen(true);
                    }}
                  >
                    Entradas não operacionais
                  </button>
                </div>
              </PopoverContent>
            </Popover>
            <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 gap-1.5 rounded-xl"
                  aria-label="Configurações de exibição do DRE"
                >
                  <Settings2 className="size-3.5" aria-hidden />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-3" align="end">
                <p className="text-xs font-medium text-[var(--foreground)]">
                  Categorias exibidas
                </p>
                <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
                  Some só da tela — os valores continuam calculados por baixo.
                </p>
                <div className="mt-3 flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <label
                      htmlFor="dre-show-investments"
                      className="text-sm text-[var(--foreground)]"
                    >
                      Investimentos
                    </label>
                    <Switch
                      id="dre-show-investments"
                      checked={displaySettings.showInvestments}
                      onCheckedChange={() =>
                        toggleDisplaySetting("showInvestments")
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <label
                      htmlFor="dre-show-non-operational-out"
                      className="text-sm text-[var(--foreground)]"
                    >
                      Saídas não operacionais
                    </label>
                    <Switch
                      id="dre-show-non-operational-out"
                      checked={displaySettings.showNonOperationalOut}
                      onCheckedChange={() =>
                        toggleDisplaySetting("showNonOperationalOut")
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <label
                      htmlFor="dre-show-non-operational-in"
                      className="text-sm text-[var(--foreground)]"
                    >
                      Entradas não operacionais
                    </label>
                    <Switch
                      id="dre-show-non-operational-in"
                      checked={displaySettings.showNonOperationalIn}
                      onCheckedChange={() =>
                        toggleDisplaySetting("showNonOperationalIn")
                      }
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 gap-1.5 rounded-xl"
              onClick={() => setLevelingModalOpen(true)}
            >
              <Scale className="size-3.5" aria-hidden />
              Nivelar custos
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 gap-1.5 rounded-xl"
              disabled={!data || loading}
              onClick={() => {
                if (!data) return;
                downloadDreYearCsv(data, showDetails, displaySettings);
              }}
            >
              <Download className="size-3.5" aria-hidden />
              CSV
            </Button>
            <div
              className="mx-1 hidden h-6 w-px bg-[var(--border)] sm:block"
              aria-hidden
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 rounded-xl"
              disabled={syncingAll || loading}
              onClick={() => requestSyncAll()}
            >
              <RefreshCw
                className={syncingAll ? "size-4 animate-spin" : "size-4"}
                aria-hidden
              />
              Sincronizar
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  className="h-10 gap-1.5 rounded-xl"
                  disabled={!data || loading}
                  onClick={() => {
                    setReconcileAfterSync(false);
                    setReconcileOpen(true);
                  }}
                >
                  <Upload className="size-3.5" aria-hidden />
                  Conciliar ML
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                A API de faturamento do Mercado Livre pode oscilar. A planilha
                oficial Por Vendas é a fonte da verdade do mês.
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {helpOpen ? (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3">
            <p className="text-sm font-medium text-[var(--foreground)]">
              Atalhos da grade
            </p>
            <ul className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
              {HELP_TIPS.map((tip) => {
                const Icon = tip.icon;
                return (
                  <li key={tip.title} className="flex items-start gap-2.5">
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-lg",
                        HELP_TONE_CLASS[tip.tone],
                      )}
                      aria-hidden
                    >
                      <Icon className="size-4" />
                    </span>
                    <p className="pt-1 text-sm leading-relaxed text-[var(--muted-foreground)]">
                      <span className="font-medium text-[var(--foreground)]">
                        {tip.title}
                      </span>{" "}
                      {tip.description}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {viewData ? (
          <div
            className={
              reconcileAfterSync
                ? "flex flex-wrap items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950"
                : "flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 px-3 py-2 text-sm text-[var(--foreground)]"
            }
          >
            <Info
              className={
                reconcileAfterSync
                  ? "size-4 shrink-0 text-amber-700"
                  : "size-4 shrink-0 text-[var(--muted-foreground)]"
              }
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              {reconcileAfterSync
                ? "Dados atualizados. Concilie com a planilha oficial Por Vendas — a API de faturamento do Mercado Livre não é a fonte da verdade."
                : "A API de faturamento do Mercado Livre pode oscilar. Depois de sincronizar, concilie o mês com a planilha Por Vendas."}
            </span>
            <Button
              type="button"
              size="sm"
              variant={reconcileAfterSync ? "default" : "outline"}
              onClick={() => {
                setReconcileAfterSync(false);
                setReconcileOpen(true);
              }}
            >
              Conciliar agora
            </Button>
            {reconcileAfterSync ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setReconcileAfterSync(false)}
              >
                Depois
              </Button>
            ) : null}
          </div>
        ) : null}

        {viewData ? (
          <DreOverview
            data={viewData}
            selectedMonth={selectedMonth}
            onSelectMonth={setSelectedMonth}
          />
        ) : null}

        {error ? (
          <UserFeedback onDismiss={() => setError(null)}>{error}</UserFeedback>
        ) : null}

        {viewData && selectedMonth
          ? (() => {
              const month = viewData.months.find(
                (item) => item.month === selectedMonth,
              );
              if (!month?.pendingReconciliationApplied) return null;
              if (!(month.month in sessionAdjustedByMonth)) return null;
              return (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  <span className="flex-1">
                    Conciliação aplicada em {month.label} — números em âmbar.
                    Salvar tudo grava como verdade do mês (preto). Descartar
                    volta ao valor anterior.
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={reconciliationBusy}
                    onClick={() =>
                      void handleDiscardReconciliation(
                        month.pendingReconciliationImportId!,
                      )
                    }
                  >
                    Descartar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={reconciliationBusy}
                    onClick={() =>
                      void handleCommitReconciliation(
                        month.pendingReconciliationImportId!,
                      )
                    }
                  >
                    Salvar tudo
                  </Button>
                </div>
              );
            })()
          : null}

        {loading && !data ? (
          <p className="text-sm text-[var(--muted-foreground)]">Carregando…</p>
        ) : null}

        {viewData ? (
          <DreYearTable
            data={viewData}
            visibility={displaySettings}
            showDetails={showDetails}
            onToggleDetails={() => setShowDetails((v) => !v)}
            selectedMonth={selectedMonth}
            onSelectedMonthChange={setSelectedMonth}
            syncingMonths={syncingMonths}
            syncingMonthMessages={syncingMonthMessages}
            onSyncMonth={requestSyncMonth}
            onLineChange={(lineKey, month, amount) =>
              void handleLineChange(lineKey, month, amount)
            }
            onLineRestore={(lineKey, month) =>
              void handleLineRestore(lineKey, month)
            }
            onFixedCostChange={(costItemId, month, amount) =>
              void handleManualCostChange(costItemId, month, amount)
            }
            onOperationalCostChange={(costItemId, month, amount) =>
              void handleManualCostChange(costItemId, month, amount)
            }
            onInvestmentCostChange={(costItemId, month, amount) =>
              void handleManualCostChange(costItemId, month, amount)
            }
            onNonOperationalOutChange={(costItemId, month, amount) =>
              void handleManualCostChange(costItemId, month, amount)
            }
            onNonOperationalInChange={(costItemId, month, amount) =>
              void handleManualCostChange(costItemId, month, amount)
            }
          />
        ) : null}

        <DreCostItemsModal
          open={fixedCostsModalOpen}
          section="fixed"
          title="Cadastrar custos fixos"
          description="1) Cadastre o nome do item aqui. 2) Depois, na tabela do DRE, dê dois cliques na célula do mês para informar o valor."
          costItems={data?.costItems ?? []}
          onClose={() => setFixedCostsModalOpen(false)}
          onChanged={() => void loadYear(year)}
          onError={setError}
        />
        <DreCostItemsModal
          open={operationalCostsModalOpen}
          section="operational"
          title="Cadastrar custos operacionais"
          description="1) Cadastre o nome do item aqui (além das linhas do ML). 2) Depois, na tabela do DRE, dê dois cliques na célula do mês para informar o valor."
          costItems={data?.operationalCostItems ?? []}
          onClose={() => setOperationalCostsModalOpen(false)}
          onChanged={() => void loadYear(year)}
          onError={setError}
        />
        <DreCostItemsModal
          open={investmentCostsModalOpen}
          section="investment"
          title="Cadastrar investimentos"
          description="1) Cadastre o nome do item aqui (ex.: marketing institucional, CAPEX). 2) Depois, na tabela do DRE, dê dois cliques na célula do mês para informar o valor. Esses itens entram após o Lucro Operacional Antes dos Investimentos."
          costItems={data?.investmentCostItems ?? []}
          onClose={() => setInvestmentCostsModalOpen(false)}
          onChanged={() => void loadYear(year)}
          onError={setError}
        />
        <DreCostItemsModal
          open={nonOperationalOutModalOpen}
          section="nonOperationalOut"
          title="Cadastrar saídas não operacionais"
          description="1) Cadastre o nome do item aqui (ex.: multa, prejuízo com processo). 2) Depois, na tabela do DRE, dê dois cliques na célula do mês para informar o valor. Esses itens entram após o Lucro Operacional."
          costItems={data?.nonOperationalOutItems ?? []}
          onClose={() => setNonOperationalOutModalOpen(false)}
          onChanged={() => void loadYear(year)}
          onError={setError}
        />
        <DreCostItemsModal
          open={nonOperationalInModalOpen}
          section="nonOperationalIn"
          title="Cadastrar entradas não operacionais"
          description="1) Cadastre o nome do item aqui (ex.: venda de imobilizado, reembolso). 2) Depois, na tabela do DRE, dê dois cliques na célula do mês para informar o valor. Esses itens somam ao Resultado Líquido."
          costItems={data?.nonOperationalInItems ?? []}
          onClose={() => setNonOperationalInModalOpen(false)}
          onChanged={() => void loadYear(year)}
          onError={setError}
        />
        <DreProductCostLevelingModal
          open={levelingModalOpen}
          year={year}
          onClose={() => setLevelingModalOpen(false)}
          onError={setError}
          onSyncAffectedMonths={(months) => {
            void syncAffectedMonths(months);
          }}
        />

        <AlertDialog
          open={syncConfirm !== null}
          onOpenChange={(open) => {
            if (!open) setSyncConfirm(null);
          }}
        >
          <AlertDialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <AlertDialogHeader>
              <AlertDialogTitle>
                {syncConfirm?.mode === "all"
                  ? "Sincronizar todos os meses?"
                  : `Sincronizar ${syncConfirmMonthLabel}?`}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {syncAdjustments.length > 0
                  ? "Há valores ajustados manualmente. Escolha o que deseja manter; o restante será atualizado com os dados importados."
                  : syncConfirm?.mode === "all"
                    ? "Já existem valores salvos. A sincronização busca os dados novamente e substitui as linhas importadas."
                    : "Já existem valores salvos neste mês. A sincronização busca os dados novamente e substitui as linhas importadas."}{" "}
                Custos fixos, operacionais e investimentos cadastrados não são
                apagados.
              </AlertDialogDescription>
            </AlertDialogHeader>

            {syncAdjustments.length > 0 ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() =>
                      setPreserveAdjustmentIds(
                        new Set(syncAdjustments.map((item) => item.id)),
                      )
                    }
                  >
                    Manter todos
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setPreserveAdjustmentIds(new Set())}
                  >
                    Não manter nenhum
                  </Button>
                </div>
                <ul className="max-h-56 space-y-1.5 overflow-y-auto rounded-lg border border-[var(--border)] p-2">
                  {syncAdjustments.map((item) => {
                    const checked = preserveAdjustmentIds.has(item.id);
                    return (
                      <li key={item.id}>
                        <label
                          className={cn(
                            "flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-[var(--muted)]/50",
                            checked && "bg-[var(--accent)]/60",
                          )}
                        >
                          <input
                            type="checkbox"
                            className="size-4 accent-[var(--primary)]"
                            checked={checked}
                            onChange={() => togglePreserveAdjustment(item.id)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="font-medium text-[var(--foreground)]">
                              {item.lineLabel}
                            </span>
                            {syncConfirm?.mode === "all" ? (
                              <span className="text-[var(--muted-foreground)]">
                                {" "}
                                · {item.monthLabel}
                              </span>
                            ) : null}
                          </span>
                          <span className="shrink-0 tabular-nums text-[var(--muted-foreground)]">
                            {formatFinancialMoney(item.amount)}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {preserveAdjustmentIds.size === 0
                    ? "Nenhum ajuste será mantido — todos os valores importados serão atualizados."
                    : `${preserveAdjustmentIds.size} de ${syncAdjustments.length} ajuste(s) serão mantidos.`}
                </p>
              </div>
            ) : null}

            <AlertDialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
              <AlertDialogCancel className="w-full sm:w-full">
                Cancelar
              </AlertDialogCancel>
              {syncAdjustments.length > 0 ? (
                <>
                  <Button
                    type="button"
                    variant="destructive"
                    className="w-full"
                    onClick={() => confirmSyncOverwrite(false)}
                  >
                    Atualizar todos (sem manter)
                  </Button>
                  <Button
                    type="button"
                    className="w-full"
                    onClick={() => confirmSyncOverwrite(true)}
                  >
                    Sincronizar mantendo selecionados
                  </Button>
                </>
              ) : (
                <AlertDialogAction
                  variant="destructive"
                  className="w-full"
                  onClick={() => confirmSyncOverwrite(false)}
                >
                  Substituir e sincronizar
                </AlertDialogAction>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {reconcileOpen && data ? (
          <DreReconciliationModal
            open
            year={year}
            months={data.months}
            defaultMonth={
              selectedMonth ??
              data.months.find((item) => item.isCurrentMonth)?.month ??
              data.months.find((item) => !item.isFutureMonth)?.month ??
              1
            }
            onClose={() => setReconcileOpen(false)}
            onApplied={handleReconciliationApplied}
            onError={setError}
          />
        ) : null}
      </div>
    </TooltipProvider>
  );
}
