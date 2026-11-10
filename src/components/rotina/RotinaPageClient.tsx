"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Info, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SegmentedTabs, tabPanelId } from "@/components/ui/segmented-tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { RotinaActionHandlers } from "@/components/rotina/RotinaActionRow";
import { RotinaAllListingsTable } from "@/components/rotina/RotinaAllListingsTable";
import { RotinaHeader } from "@/components/rotina/RotinaHeader";
import { RotinaInfoLists } from "@/components/rotina/RotinaInfoLists";
import { RotinaRefreshOverlay } from "@/components/rotina/RotinaRefreshOverlay";
import { RotinaSegmentSummary } from "@/components/rotina/RotinaSegmentSummary";
import { RotinaTaskGroup } from "@/components/rotina/RotinaTaskGroup";
import {
  RotinaTargetsSheet,
  type RotinaTargetsDraft,
} from "@/components/rotina/RotinaTargetsSheet";
import { useRotinaRefresh } from "@/components/rotina/use-rotina-refresh";
import { useBeforeUnloadGuard } from "@/hooks/use-before-unload-guard";
import { usePersistedJson } from "@/hooks/use-persisted-json";
import { readApiError } from "@/lib/api/api-client-error";
import type { RotinaActionView, RotinaView } from "@/lib/rotina/view";
import {
  applyActionOverrides,
  groupActiveByRule,
  summarizeActions,
  type ActionOverride,
  type SegmentFilter,
} from "@/lib/rotina/view-summary";

type ViewTab = "acoes" | "anuncios";

const SEGMENT_TABS = [
  { id: "all" as const, label: "Tudo" },
  { id: "own" as const, label: "Próprios" },
  { id: "catalog" as const, label: "Catálogo" },
];
const VIEW_TABS = [
  { id: "acoes" as const, label: "Ações do dia" },
  { id: "anuncios" as const, label: "Anúncios" },
];

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
  const refresh = useRotinaRefresh();
  useBeforeUnloadGuard(refresh.state.running);

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
      } catch (e) {
        setOverrides((current) => {
          const next = new Map(current);
          next.delete(action.id);
          return next;
        });
        toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
      }
    },
    [reload],
  );

  const handlers: RotinaActionHandlers = {
    busy: refresh.state.running,
    onDone: (action) =>
      decide(action, action.kind === "event" ? "ack" : "done", {
        bucket: "done",
        doneToday: true,
      }),
    onSnooze: (action, days) =>
      decide(action, "snooze", { bucket: "snoozed", doneToday: false }, days),
    onDismiss: (action) =>
      decide(action, "dismiss", { bucket: "dismissed", doneToday: false }),
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

  const undo = (action: RotinaActionView) =>
    decide(action, "reopen", { bucket: "active", doneToday: false, snoozedUntil: null });

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
      <div className="space-y-6">
        <RotinaHeader
          todayLabel={view.todayLabel}
          summary={summary}
          lastCompleteRunLabel={view.lastCompleteRunLabel}
          onRefresh={() => void runRefresh()}
          onOpenTargets={() => setTargetsOpen(true)}
          busy={busy}
        />

        {!view.dataIsFromToday ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--muted)]/30 px-4 py-3 sm:flex-row sm:items-center">
            <p className="flex-1 text-sm text-[var(--foreground)]">
              {view.lastCompleteRunLabel
                ? `Margem, ADS e promoções são de ${view.lastCompleteRunLabel}. Atualize para ver o dia de hoje.`
                : "Seus anúncios ainda não foram lidos. A primeira atualização leva alguns minutos; o catálogo já aparece abaixo, ao vivo."}
            </p>
            <Button size="sm" onClick={() => void runRefresh()} disabled={busy}>
              <RefreshCw aria-hidden />
              Atualizar agora
            </Button>
          </div>
        ) : null}

        {view.warnings.length > 0 ? (
          <ul className="space-y-1">
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

        <RotinaSegmentSummary
          summary={summary}
          segment={segment}
          onSegmentChange={setStoredSegment}
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SegmentedTabs
            tabs={SEGMENT_TABS}
            value={segment}
            onValueChange={(value) => setStoredSegment(value)}
            baseId="rotina-segment"
            ariaLabel="Segmento"
            className="[&_button]:whitespace-nowrap"
          />
          <SegmentedTabs
            tabs={VIEW_TABS}
            value={tab}
            onValueChange={setTab}
            baseId="rotina-view"
            ariaLabel="Visão"
            className="[&_button]:whitespace-nowrap"
          />
        </div>

        {tab === "acoes" ? (
          <div id={tabPanelId("rotina-view", "acoes")} role="tabpanel" className="space-y-6">
            {groups.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--border)] px-4 py-10 text-center">
                <CheckCircle2 className="size-8 text-emerald-600" aria-hidden />
                <p className="text-sm font-semibold text-[var(--foreground)]">
                  Tudo em dia por aqui.
                </p>
                <p className="max-w-md text-xs text-[var(--muted-foreground)]">
                  {view.hasHealth
                    ? "Nenhuma ação pendente neste segmento com as metas de agora."
                    : "Clique em Atualizar para ler margem, ADS e promoções dos seus anúncios."}
                </p>
              </div>
            ) : (
              groups.map((group) => (
                <RotinaTaskGroup
                  key={group.rule}
                  rule={group.rule}
                  actions={group.actions}
                  handlers={handlers}
                  timeZone={view.timeZone}
                />
              ))
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
          <div id={tabPanelId("rotina-view", "anuncios")} role="tabpanel">
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
