"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { Check, ChevronDown, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { FormInput } from "@/components/ui/form-input";
import { readApiError } from "@/lib/api-client-error";
import { cn } from "@/lib/utils";
import type { RevenueSimulationPayload } from "@/lib/insights/types";

export type ActiveSimulation = { id: string; name: string } | null;

type SimulationSummary = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

type SavedSimulationsMenuProps = {
  activeSimulation: ActiveSimulation;
  onActiveSimulationChange: (value: ActiveSimulation) => void;
  buildPayload: () => RevenueSimulationPayload;
  onLoad: (payload: RevenueSimulationPayload) => void;
  className?: string;
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type NameModalProps = {
  title: string;
  defaultName: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (name: string) => void;
};

function SaveNameModal({
  title,
  defaultName,
  busy,
  error,
  onCancel,
  onConfirm,
}: NameModalProps) {
  const titleId = useId();
  const [name, setName] = useState(defaultName);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onCancel();
    },
    [onCancel],
  );

  const trimmed = name.trim();

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/40 p-4"
      onClick={handleBackdrop}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-base font-semibold text-[var(--primary)]">
            {title}
          </h2>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onCancel}>
            <X className="size-4" aria-hidden />
          </Button>
        </div>

        <FormInput
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex.: Cenário conservador Q3"
          label="Nome da simulação"
          className="mt-4"
          inputClassName="border-[var(--primary)]/40 focus:ring-[var(--primary)]/40"
          onKeyDown={(e) => {
            if (e.key === "Enter" && trimmed) onConfirm(trimmed);
          }}
        />

        {error && (
          <p className="mt-2 text-sm text-rose-600" role="alert">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={busy || !trimmed}
            onClick={() => onConfirm(trimmed)}
          >
            Salvar
          </Button>
        </div>
      </div>
    </div>
  );
}

type ConfirmDeleteModalProps = {
  name: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

function ConfirmDeleteModal({ name, busy, onCancel, onConfirm }: ConfirmDeleteModalProps) {
  const titleId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onCancel();
    },
    [onCancel],
  );

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/40 p-4"
      onClick={handleBackdrop}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-base font-semibold text-rose-600">
            Excluir simulação
          </h2>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onCancel}>
            <X className="size-4" aria-hidden />
          </Button>
        </div>

        <p className="mt-3 text-sm text-[var(--muted-foreground)]">
          Excluir <span className="font-medium text-[var(--foreground)]">&quot;{name}&quot;</span>?
          Essa ação não pode ser desfeita.
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={onConfirm}
          >
            Excluir
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SavedSimulationsMenu({
  activeSimulation,
  onActiveSimulationChange,
  buildPayload,
  onLoad,
  className,
}: SavedSimulationsMenuProps) {
  const [open, setOpen] = useState(false);
  const [simulations, setSimulations] = useState<SimulationSummary[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [busy, setBusy] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [nameModal, setNameModal] = useState<"new" | "duplicate" | null>(null);
  const [nameModalError, setNameModalError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SimulationSummary | null>(null);

  const loadList = async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const res = await fetch("/api/insights/revenue-simulations");
      if (!res.ok) {
        setListError(await readApiError(res, "revenue_simulations_list_failed"));
        return;
      }
      const json = (await res.json()) as { simulations: SimulationSummary[] };
      setSimulations(json.simulations);
    } catch {
      setListError("Falha de rede ao carregar simulações salvas.");
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    if (open) void loadList();
  }, [open]);

  const flashSaved = () => {
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1800);
  };

  const handleSaveClick = () => {
    if (activeSimulation) {
      void overwriteActive();
    } else {
      setNameModalError(null);
      setNameModal("new");
    }
  };

  const overwriteActive = async () => {
    if (!activeSimulation) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/insights/revenue-simulations/${activeSimulation.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payload: buildPayload() }),
        },
      );
      if (!res.ok) {
        setListError(await readApiError(res, "revenue_simulation_update_failed"));
        return;
      }
      flashSaved();
    } catch {
      setListError("Falha de rede ao salvar a simulação.");
    } finally {
      setBusy(false);
    }
  };

  const createNew = async (name: string) => {
    setBusy(true);
    setNameModalError(null);
    try {
      const res = await fetch("/api/insights/revenue-simulations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, payload: buildPayload() }),
      });
      if (!res.ok) {
        setNameModalError(await readApiError(res, "revenue_simulation_create_failed"));
        return;
      }
      const json = (await res.json()) as { simulation: SimulationSummary };
      onActiveSimulationChange({ id: json.simulation.id, name: json.simulation.name });
      setNameModal(null);
      flashSaved();
      void loadList();
    } catch {
      setNameModalError("Falha de rede ao salvar a simulação.");
    } finally {
      setBusy(false);
    }
  };

  const openSimulation = async (id: string) => {
    setBusy(true);
    setListError(null);
    try {
      const res = await fetch(`/api/insights/revenue-simulations/${id}`);
      if (!res.ok) {
        setListError(await readApiError(res, "revenue_simulation_get_failed"));
        return;
      }
      const json = (await res.json()) as {
        simulation: { id: string; name: string; payload: RevenueSimulationPayload };
      };
      onLoad(json.simulation.payload);
      onActiveSimulationChange({ id: json.simulation.id, name: json.simulation.name });
      setOpen(false);
    } catch {
      setListError("Falha de rede ao abrir a simulação.");
    } finally {
      setBusy(false);
    }
  };

  const confirmRemoveSimulation = async () => {
    if (!deleteTarget) return;
    const { id } = deleteTarget;
    setBusy(true);
    setListError(null);
    try {
      const res = await fetch(`/api/insights/revenue-simulations/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setListError(await readApiError(res, "revenue_simulation_delete_failed"));
        return;
      }
      if (activeSimulation?.id === id) onActiveSimulationChange(null);
      setDeleteTarget(null);
      void loadList();
    } catch {
      setListError("Falha de rede ao excluir a simulação.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        type="button"
        variant="default"
        size="sm"
        disabled={busy}
        onClick={handleSaveClick}
        className={cn(
          savedFlash &&
            "bg-emerald-600 text-white hover:bg-emerald-600 dark:bg-emerald-500 dark:hover:bg-emerald-500",
        )}
      >
        {savedFlash ? (
          <>
            <Check className="size-3.5" aria-hidden />
            Salvo
          </>
        ) : (
          <>
            <Save className="size-3.5" aria-hidden />
            {activeSimulation ? `Salvar "${activeSimulation.name}"` : "Salvar simulação"}
          </>
        )}
      </Button>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="border border-[var(--primary)]/30 text-[var(--primary)] hover:bg-[var(--primary)]/10"
          >
            Simulações salvas
            <ChevronDown className="size-3.5" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 max-w-none p-0">
          <div className="max-h-80 overflow-y-auto p-2">
            {activeSimulation && (
              <button
                type="button"
                className="mb-1 w-full cursor-pointer rounded-md px-2 py-1.5 text-left text-xs font-medium text-[var(--primary)] hover:bg-[var(--muted)]"
                disabled={busy}
                onClick={() => {
                  setNameModalError(null);
                  setNameModal("duplicate");
                }}
              >
                Salvar como nova a partir de &quot;{activeSimulation.name}&quot;
              </button>
            )}

            {listError && (
              <p className="mb-2 px-1 text-xs text-rose-600" role="alert">
                {listError}
              </p>
            )}

            {loadingList ? (
              <p className="px-1 py-2 text-xs text-[var(--muted-foreground)]">
                Carregando…
              </p>
            ) : simulations.length === 0 ? (
              <p className="px-1 py-2 text-xs text-[var(--muted-foreground)]">
                Nenhuma simulação salva ainda.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {simulations.map((sim) => (
                  <li
                    key={sim.id}
                    className={cn(
                      "flex items-center justify-between gap-1 rounded-md px-2 py-1.5 hover:bg-[var(--muted)]",
                      activeSimulation?.id === sim.id && "bg-[var(--muted)]/60",
                    )}
                  >
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void openSimulation(sim.id)}
                      className="min-w-0 flex-1 cursor-pointer text-left"
                    >
                      <div className="truncate text-sm font-medium">{sim.name}</div>
                      <div className="text-[10px] text-[var(--muted-foreground)]">
                        {fmtDate(sim.updatedAt)}
                      </div>
                    </button>
                    <button
                      type="button"
                      title="Excluir simulação"
                      disabled={busy}
                      onClick={() => setDeleteTarget(sim)}
                      className="shrink-0 cursor-pointer text-[var(--muted-foreground)] hover:text-rose-600"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {nameModal && (
        <SaveNameModal
          title={nameModal === "duplicate" ? "Salvar como nova simulação" : "Salvar simulação"}
          defaultName={
            nameModal === "duplicate" && activeSimulation
              ? `${activeSimulation.name} (cópia)`
              : ""
          }
          busy={busy}
          error={nameModalError}
          onCancel={() => setNameModal(null)}
          onConfirm={(name) => void createNew(name)}
        />
      )}

      {deleteTarget && (
        <ConfirmDeleteModal
          name={deleteTarget.name}
          busy={busy}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void confirmRemoveSimulation()}
        />
      )}
    </div>
  );
}
