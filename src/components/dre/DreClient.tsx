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
import { useDreSync } from "@/components/dre/use-dre-sync";
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
import { readApiError } from "@/lib/api/api-client-error";
import {
  formatFinancialMoney,
} from "@/lib/pricing/financial-margin";
import type { DreEditableLineKey } from "@/lib/dre/dre-calculations";
import { downloadDreYearCsv } from "@/lib/dre/dre-export-csv";
import type { DreVisibilitySettings } from "@/lib/dre/dre-table-rows";
import type { DreYearView } from "@/lib/dre/dre-year-data";
import { getZonedYearMonth } from "@/lib/mercadolibre/revenue-periods";
import { cn } from "@/lib/utils";

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

export function DreClient({
  initialYear,
  initialData,
  initialDisplaySettings,
}: {
  initialYear: number;
  initialData: DreYearView;
  initialDisplaySettings: DreVisibilitySettings;
}) {
  const currentYear = useMemo(() => getZonedYearMonth().year, []);
  const [year, setYear] = useState(initialYear);
  const [data, setData] = useState<DreYearView | null>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(true);
  const toggleShowDetails = useCallback(
    () => setShowDetails((v) => !v),
    [],
  );
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  // As 7 Sheets abaixo (5 modais de custo + nivelamento + conciliação) nunca
  // abrem ao mesmo tempo — a exclusão mútua hoje é garantida pelo overlay
  // modal do Radix Sheet (cada trigger fecha o teclado/mouse do resto da
  // página), não por lógica de estado. Um único `activeModal` remove a
  // possibilidade de dois ficarem "abertos" ao mesmo tempo no estado, sem
  // mudar nenhum comportamento observável.
  const [activeModal, setActiveModal] = useState<
    | "fixedCosts"
    | "operational"
    | "investment"
    | "nonOperationalOut"
    | "nonOperationalIn"
    | "leveling"
    | "reconcile"
    | null
  >(null);
  /** Marca visual "ajustado" + restore — só na sessão atual (some no reload). */
  const [sessionAdjustedByMonth, setSessionAdjustedByMonth] = useState<
    Record<number, DreEditableLineKey[]>
  >({});
  const [helpOpen, setHelpOpen] = useState(false);
  const [cadastroOpen, setCadastroOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [displaySettings, setDisplaySettings] =
    useState<DreVisibilitySettings>(initialDisplaySettings);
  const [reconciliationBusy, setReconciliationBusy] = useState(false);
  /** Ano inicial já chega via prop (carregado no servidor) — só refaz a busca
   * quando o usuário troca o ano. */
  const skipNextYearFetch = useRef(true);

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

  const {
    syncingMonths,
    syncingMonthMessages,
    syncingAll,
    syncConfirm,
    setSyncConfirm,
    preserveAdjustmentIds,
    setPreserveAdjustmentIds,
    reconcileAfterSync,
    setReconcileAfterSync,
    syncAdjustments,
    requestSyncMonth,
    syncAffectedMonths,
    cancelSyncingMonths,
    togglePreserveAdjustment,
    confirmSyncOverwrite,
  } = useDreSync({
    year,
    data,
    setData,
    setSessionAdjustedByMonth,
    loadYear,
    setError,
  });

  useEffect(() => {
    if (skipNextYearFetch.current) {
      skipNextYearFetch.current = false;
      return;
    }
    void loadYear(year);
  }, [year, loadYear]);

  useEffect(() => {
    setSelectedMonth(null);
    setSessionAdjustedByMonth({});
  }, [year]);

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
    syncConfirm !== null
      ? (data?.months.find((m) => m.month === syncConfirm)?.label ??
        `mês ${syncConfirm}`)
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
                      setActiveModal("operational");
                    }}
                  >
                    Custos operacionais
                  </button>
                  <button
                    type="button"
                    className="cursor-pointer rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--muted)]"
                    onClick={() => {
                      setCadastroOpen(false);
                      setActiveModal("fixedCosts");
                    }}
                  >
                    Custos fixos
                  </button>
                  <button
                    type="button"
                    className="cursor-pointer rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--muted)]"
                    onClick={() => {
                      setCadastroOpen(false);
                      setActiveModal("investment");
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
                      setActiveModal("nonOperationalOut");
                    }}
                  >
                    Saídas não operacionais
                  </button>
                  <button
                    type="button"
                    className="cursor-pointer rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--muted)]"
                    onClick={() => {
                      setCadastroOpen(false);
                      setActiveModal("nonOperationalIn");
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
              onClick={() => setActiveModal("leveling")}
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
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  className="h-10 gap-1.5 rounded-xl"
                  disabled={!data || loading}
                  onClick={() => {
                    setReconcileAfterSync(false);
                    setActiveModal("reconcile");
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
                setActiveModal("reconcile");
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
            onToggleDetails={toggleShowDetails}
            selectedMonth={selectedMonth}
            onSelectedMonthChange={setSelectedMonth}
            syncingMonths={syncingMonths}
            syncingMonthMessages={syncingMonthMessages}
            onSyncMonth={requestSyncMonth}
            onLineChange={handleLineChange}
            onLineRestore={handleLineRestore}
            onFixedCostChange={handleManualCostChange}
            onOperationalCostChange={handleManualCostChange}
            onInvestmentCostChange={handleManualCostChange}
            onNonOperationalOutChange={handleManualCostChange}
            onNonOperationalInChange={handleManualCostChange}
          />
        ) : null}

        <DreCostItemsModal
          open={activeModal === "fixedCosts"}
          section="fixed"
          title="Cadastrar custos fixos"
          description="1) Cadastre o nome do item aqui. 2) Depois, na tabela do DRE, dê dois cliques na célula do mês para informar o valor."
          costItems={data?.costItems ?? []}
          onClose={() => setActiveModal(null)}
          onChanged={() => void loadYear(year)}
          onError={setError}
        />
        <DreCostItemsModal
          open={activeModal === "operational"}
          section="operational"
          title="Cadastrar custos operacionais"
          description="1) Cadastre o nome do item aqui (além das linhas do ML). 2) Depois, na tabela do DRE, dê dois cliques na célula do mês para informar o valor."
          costItems={data?.operationalCostItems ?? []}
          onClose={() => setActiveModal(null)}
          onChanged={() => void loadYear(year)}
          onError={setError}
        />
        <DreCostItemsModal
          open={activeModal === "investment"}
          section="investment"
          title="Cadastrar investimentos"
          description="1) Cadastre o nome do item aqui (ex.: marketing institucional, CAPEX). 2) Depois, na tabela do DRE, dê dois cliques na célula do mês para informar o valor. Esses itens entram após o Lucro Operacional Antes dos Investimentos."
          costItems={data?.investmentCostItems ?? []}
          onClose={() => setActiveModal(null)}
          onChanged={() => void loadYear(year)}
          onError={setError}
        />
        <DreCostItemsModal
          open={activeModal === "nonOperationalOut"}
          section="nonOperationalOut"
          title="Cadastrar saídas não operacionais"
          description="1) Cadastre o nome do item aqui (ex.: multa, prejuízo com processo). 2) Depois, na tabela do DRE, dê dois cliques na célula do mês para informar o valor. Esses itens entram após o Lucro Operacional."
          costItems={data?.nonOperationalOutItems ?? []}
          onClose={() => setActiveModal(null)}
          onChanged={() => void loadYear(year)}
          onError={setError}
        />
        <DreCostItemsModal
          open={activeModal === "nonOperationalIn"}
          section="nonOperationalIn"
          title="Cadastrar entradas não operacionais"
          description="1) Cadastre o nome do item aqui (ex.: venda de imobilizado, reembolso). 2) Depois, na tabela do DRE, dê dois cliques na célula do mês para informar o valor. Esses itens somam ao Resultado Líquido."
          costItems={data?.nonOperationalInItems ?? []}
          onClose={() => setActiveModal(null)}
          onChanged={() => void loadYear(year)}
          onError={setError}
        />
        <DreProductCostLevelingModal
          open={activeModal === "leveling"}
          year={year}
          onClose={() => setActiveModal(null)}
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
                {`Sincronizar ${syncConfirmMonthLabel}?`}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {syncAdjustments.length > 0
                  ? "Há valores ajustados manualmente. Escolha o que deseja manter; o restante será atualizado com os dados importados."
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
        {activeModal === "reconcile" && data ? (
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
            onClose={() => setActiveModal(null)}
            onApplied={handleReconciliationApplied}
            onError={setError}
          />
        ) : null}
      </div>
    </TooltipProvider>
  );
}
