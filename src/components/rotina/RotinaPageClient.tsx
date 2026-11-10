"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronsDownUp, ChevronsUpDown, Info } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SegmentedTabs, tabId, tabPanelId } from "@/components/ui/segmented-tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  SNOOZE_OPTIONS,
  type RotinaActionHandlers,
} from "@/components/rotina/RotinaActionRow";
import { RotinaAllListingsTable } from "@/components/rotina/RotinaAllListingsTable";
import { RotinaHeader } from "@/components/rotina/RotinaHeader";
import { RotinaInfoLists } from "@/components/rotina/RotinaInfoLists";
import { RotinaRefreshOverlay } from "@/components/rotina/RotinaRefreshOverlay";
import { RotinaTaskGroup } from "@/components/rotina/RotinaTaskGroup";
import {
  RotinaTargetsSheet,
  type RotinaTargetsDraft,
} from "@/components/rotina/RotinaTargetsSheet";
import { useRotinaRefresh } from "@/components/rotina/use-rotina-refresh";
import { useUpdatedToday } from "@/components/rotina/use-updated-today";
import { useBeforeUnloadGuard } from "@/hooks/use-before-unload-guard";
import { usePersistedJson } from "@/hooks/use-persisted-json";
import { readApiError } from "@/lib/api/api-client-error";
import { ROTINA_RULES, type RotinaRuleKey } from "@/lib/rotina/rule-registry";
import type { RotinaActionView, RotinaView } from "@/lib/rotina/view";
import {
  applyActionOverrides,
  groupActiveByRule,
  summarizeActions,
  type ActionOverride,
  type SegmentFilter,
} from "@/lib/rotina/view-summary";

type ViewTab = "acoes" | "anuncios";

function countBadge(count: number): string | undefined {
  return count > 0 ? String(count) : undefined;
}

const SNOOZE_TOAST: Record<number, string> = Object.fromEntries(
  SNOOZE_OPTIONS.map((option) => [
    option.days,
    option.days === 1 ? "Adiado até amanhã." : `Adiado por ${option.days} dias.`,
  ]),
);

function isSegment(value: unknown): value is SegmentFilter {
  return value === "all" || value === "own" || value === "catalog";
}

async function patchAction(body: {
  mlItemId: string;
  rule: string;
  op: "done" | "ack" | "snooze" | "dismiss" | "reopen";
  days?: number;
}): Promise<void> {
  const response = await fetch("/api/rotina/actions", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await readApiError(response, "rotina_action_failed"));
}

export function RotinaPageClient({ view }: { view: RotinaView }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [storedSegment, setStoredSegment] = usePersistedJson<unknown>(
    "rotina-segment",
    "all",
  );
  const segment: SegmentFilter = isSegment(storedSegment) ? storedSegment : "all";
  const [tab, setTab] = useState<ViewTab>("acoes");
  const [overrides, setOverrides] = useState<Map<string, ActionOverride>>(new Map());
  const [targetsOpen, setTargetsOpen] = useState(
    () => !view.settings.configured,
  );
  const [savingTargets, setSavingTargets] = useState(false);
  // Grupos começam fechados: a pilha fechada é o resumo do dia.
  const [openGroups, setOpenGroups] = useState<Set<RotinaRuleKey>>(() => new Set());
  const refresh = useRotinaRefresh();
  useBeforeUnloadGuard(refresh.state.running);
  // O "Desfazer" do toast vive fora do render: lê o estado da atualização na hora.
  const busyRef = useRef(false);
  useEffect(() => {
    busyRef.current = refresh.state.running;
  }, [refresh.state.running]);
  const freshness = useUpdatedToday({
    lastCompleteRunAt: view.lastCompleteRunAt,
    timeZone: view.timeZone,
    serverUpdatedToday: view.dataIsFromToday,
    serverTodayLabel: view.todayLabel,
    serverLastRunLabel: view.lastCompleteRunLabel,
  });

  // Dado novo do servidor: as decisões otimistas já estão nele. Ajuste no
  // render (e não em effect) para não pintar um quadro com as duas versões.
  const [overridesFor, setOverridesFor] = useState(view.generatedAt);
  if (overridesFor !== view.generatedAt) {
    setOverridesFor(view.generatedAt);
    setOverrides(new Map());
  }

  const actions = useMemo(
    () => applyActionOverrides(view.actions, overrides),
    [view.actions, overrides],
  );
  const summary = useMemo(() => summarizeActions(actions), [actions]);
  const groups = useMemo(() => groupActiveByRule(actions, segment), [actions, segment]);
  const listingCounts = useMemo(() => {
    const catalog = view.listings.filter((row) => row.catalogListing).length;
    return { all: view.listings.length, own: view.listings.length - catalog, catalog };
  }, [view.listings]);
  const segmentCounts =
    tab === "acoes"
      ? {
          all: summary.active,
          own: summary.bySegment.own,
          catalog: summary.bySegment.catalog,
        }
      : listingCounts;
  const segmentTabs = [
    { id: "all" as const, label: "Tudo", badge: countBadge(segmentCounts.all) },
    { id: "own" as const, label: "Próprios", badge: countBadge(segmentCounts.own) },
    { id: "catalog" as const, label: "Catálogo", badge: countBadge(segmentCounts.catalog) },
  ];
  const viewTabs = [
    {
      id: "acoes" as const,
      label: "Ações do dia",
      badge: countBadge(groups.reduce((total, group) => total + group.actions.length, 0)),
    },
    {
      id: "anuncios" as const,
      label: "Anúncios",
      badge: countBadge(listingCounts[segment]),
    },
  ];
  const allGroupsOpen = groups.length > 0 && groups.every((group) => openGroups.has(group.rule));

  const toggleGroup = useCallback((rule: RotinaRuleKey) => {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(rule)) next.delete(rule);
      else next.add(rule);
      return next;
    });
  }, []);

  const reload = useCallback(() => {
    startTransition(() => router.refresh());
  }, [router]);

  const runRefresh = useCallback(
    async (itemIds?: string[]) => {
      const outcome = await refresh.run(itemIds);
      if (outcome.kind === "ok") {
        const extra = outcome.result.warnings.length;
        toast.success(
          itemIds?.length
            ? "Anúncio recalculado."
            : `Anúncios atualizados: ${outcome.result.done} lidos.`,
          extra > 0 ? { description: outcome.result.warnings[0] } : undefined,
        );
      } else if (outcome.kind === "stopped") {
        toast("Atualização parada. O que já foi calculado ficou salvo.");
      } else {
        toast.error(outcome.message);
      }
      reload();
    },
    [refresh, reload],
  );

  const decide = useCallback(
    async (
      action: RotinaActionView,
      op: "done" | "ack" | "snooze" | "dismiss" | "reopen",
      override: ActionOverride,
      days?: number,
    ) => {
      setOverrides((current) => new Map(current).set(action.id, override));
      try {
        await patchAction({ mlItemId: action.stateItemId, rule: action.rule, op, days });
        reload();
        return true;
      } catch (e) {
        setOverrides((current) => {
          const next = new Map(current);
          next.delete(action.id);
          return next;
        });
        toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
        return false;
      }
    },
    [reload],
  );

  const undo = (action: RotinaActionView) =>
    decide(action, "reopen", { bucket: "active", doneToday: false, snoozedUntil: null });

  /** Confirmação com "Desfazer" — só depois que o servidor gravou a decisão. */
  function confirmWithUndo(saved: boolean, action: RotinaActionView, message: string) {
    if (!saved) return;
    toast.success(message, {
      description: action.listing.title,
      action: {
        label: "Desfazer",
        onClick: () => {
          if (busyRef.current) {
            toast("Espere a atualização terminar para desfazer.");
            return;
          }
          void undo(action);
        },
      },
    });
  }

  const handlers: RotinaActionHandlers = {
    busy: refresh.state.running,
    onDone: async (action) => {
      const event = action.kind === "event";
      const saved = await decide(action, event ? "ack" : "done", {
        bucket: "done",
        doneToday: true,
      });
      confirmWithUndo(saved, action, event ? "Marcado como ciente." : "Marcado como feito.");
    },
    onSnooze: async (action, days) => {
      const saved = await decide(
        action,
        "snooze",
        { bucket: "snoozed", doneToday: false },
        days,
      );
      confirmWithUndo(saved, action, SNOOZE_TOAST[days] ?? "Adiado.");
    },
    onDismiss: async (action) => {
      const saved = await decide(action, "dismiss", { bucket: "dismissed", doneToday: false });
      confirmWithUndo(
        saved,
        action,
        `“${ROTINA_RULES[action.rule].settingsLabel}” ignorado neste anúncio.`,
      );
    },
    onRecalculate: (mlItemId) => {
      void runRefresh([mlItemId]);
    },
    onSaveTarget: async (action, draft) => {
      try {
        const response = await fetch(
          `/api/rotina/targets/${encodeURIComponent(action.listing.mlItemId)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(draft),
          },
        );
        if (!response.ok) {
          throw new Error(await readApiError(response, "rotina_target_failed"));
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Não foi possível salvar a meta.");
        return false;
      }
      toast.success("Meta do anúncio salva.");
      // O preço mínimo depende da meta: recalcula só este anúncio.
      if (action.listing.hasHealth) void runRefresh([action.listing.mlItemId]);
      else reload();
      return true;
    },
  };

  async function saveTargets(draft: RotinaTargetsDraft) {
    setSavingTargets(true);
    try {
      const response = await fetch("/api/rotina/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!response.ok) throw new Error(await readApiError(response, "rotina_settings_failed"));
      toast.success("Metas salvas.", {
        description: "Os preços mínimos com a meta nova saem no próximo Atualizar.",
      });
      setTargetsOpen(false);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar as metas.");
    } finally {
      setSavingTargets(false);
    }
  }

  async function clearOverride(mlItemId: string) {
    setSavingTargets(true);
    try {
      const response = await fetch(`/api/rotina/targets/${encodeURIComponent(mlItemId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minMarginPercent: null, tacosTargetPercent: null }),
      });
      if (!response.ok) throw new Error(await readApiError(response, "rotina_target_failed"));
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a meta.");
    } finally {
      setSavingTargets(false);
    }
  }

  const busy = refresh.state.running;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-5">
        <RotinaHeader
          todayLabel={freshness.todayLabel}
          summary={summary}
          updatedToday={freshness.updatedToday}
          lastCompleteRunLabel={freshness.lastRunLabel}
          onRefresh={() => void runRefresh()}
          onOpenTargets={() => setTargetsOpen(true)}
          busy={busy}
        />

        {view.warnings.length > 0 ? (
          <ul className="space-y-1 px-1">
            {view.warnings.map((warning) => (
              <li
                key={warning}
                className="flex items-start gap-2 text-xs text-[var(--muted-foreground)]"
              >
                <Info className="mt-0.5 size-3.5 shrink-0 opacity-60" aria-hidden />
                {warning}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <SegmentedTabs
            tabs={viewTabs}
            value={tab}
            onValueChange={setTab}
            baseId="rotina-view"
            ariaLabel="Visão"
            className="w-full md:w-auto [&_button]:whitespace-nowrap"
          />
          <SegmentedTabs
            tabs={segmentTabs}
            value={segment}
            onValueChange={(value) => setStoredSegment(value)}
            baseId="rotina-segment"
            ariaLabel="Segmento"
            className="w-full md:w-auto [&_button]:whitespace-nowrap [&_button]:px-3"
          />
        </div>

        {tab === "acoes" ? (
          <div
            id={tabPanelId("rotina-view", "acoes")}
            role="tabpanel"
            aria-labelledby={tabId("rotina-view", "acoes")}
            className="space-y-6"
          >
            {groups.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)]/50 px-4 py-12 text-center">
                <span className="flex size-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="size-7" aria-hidden />
                </span>
                <div>
                  <p className="text-base font-semibold text-[var(--foreground)]">
                    Tudo em dia por aqui.
                  </p>
                  <p className="mt-1 max-w-md text-sm text-[var(--muted-foreground)]">
                    {view.hasHealth
                      ? "Nenhuma ação pendente neste segmento com as metas de agora."
                      : "Clique em Atualizar para ler margem, ADS e promoções dos seus anúncios."}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-3 px-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                    Tarefas de hoje
                    <span className="ml-1.5 font-normal normal-case tracking-normal">
                      · {groups.length} {groups.length === 1 ? "tarefa" : "tarefas"}
                    </span>
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-mr-2 text-[var(--muted-foreground)]"
                    onClick={() =>
                      setOpenGroups(
                        allGroupsOpen ? new Set() : new Set(groups.map((group) => group.rule)),
                      )
                    }
                  >
                    {allGroupsOpen ? (
                      <ChevronsDownUp aria-hidden />
                    ) : (
                      <ChevronsUpDown aria-hidden />
                    )}
                    {allGroupsOpen ? "Fechar todas" : "Abrir todas"}
                  </Button>
                </div>
                {groups.map((group) => (
                  <RotinaTaskGroup
                    key={group.rule}
                    rule={group.rule}
                    actions={group.actions}
                    handlers={handlers}
                    timeZone={view.timeZone}
                    open={openGroups.has(group.rule)}
                    onToggle={() => toggleGroup(group.rule)}
                  />
                ))}
              </div>
            )}

            <RotinaInfoLists
              info={view.info}
              actions={actions}
              timeZone={view.timeZone}
              busy={busy}
              onUndo={undo}
            />
          </div>
        ) : (
          <div
            id={tabPanelId("rotina-view", "anuncios")}
            role="tabpanel"
            aria-labelledby={tabId("rotina-view", "anuncios")}
          >
            <RotinaAllListingsTable
              rows={view.listings}
              segment={segment}
              timeZone={view.timeZone}
            />
          </div>
        )}
      </div>

      {targetsOpen ? (
        <RotinaTargetsSheet
          open={targetsOpen}
          onOpenChange={setTargetsOpen}
          settings={view.settings}
          overrides={view.targetOverrides}
          saving={savingTargets}
          onSave={saveTargets}
          onClearOverride={clearOverride}
        />
      ) : null}

      <RotinaRefreshOverlay state={refresh.state} onStop={refresh.stop} />
    </TooltipProvider>
  );
}
