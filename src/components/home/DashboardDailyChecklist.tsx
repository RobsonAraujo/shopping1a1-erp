"use client";

import { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CollapsibleHomeCard } from "@/components/home/CollapsibleHomeCard";
import { CoffeeLoader } from "@/components/home/CoffeeLoader";
import { FormInput } from "@/components/ui/form-input";
import { usePersistedJson } from "@/hooks/use-persisted-json";
import { usePersistedOpen } from "@/hooks/use-persisted-open";
import { cn } from "@/lib/utils";

type DailyTask = {
  id: string;
  text: string;
  done: boolean;
};

const EMPTY_TASKS: DailyTask[] = [];

function todayStorageKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `dashboard-daily-tasks:${y}-${m}-${d}`;
}

export function DashboardDailyChecklist() {
  const [tasks, setTasks] = usePersistedJson<DailyTask[]>(
    todayStorageKey(),
    EMPTY_TASKS,
  );
  const [draft, setDraft] = useState("");
  const { open, toggle } = usePersistedOpen(
    "dashboard-daily-tasks-open",
    false,
  );

  function addTask() {
    const text = draft.trim();
    if (!text) return;
    setTasks([...tasks, { id: crypto.randomUUID(), text, done: false }]);
    setDraft("");
  }

  function toggleTask(id: string) {
    setTasks(
      tasks.map((task) =>
        task.id === id ? { ...task, done: !task.done } : task,
      ),
    );
  }

  function removeTask(id: string) {
    setTasks(tasks.filter((task) => task.id !== id));
  }

  const pendingCount = tasks.filter((task) => !task.done).length;
  const statusLabel =
    tasks.length === 0
      ? "Toque para montar sua lista de hoje"
      : pendingCount === 0
        ? "Tudo feito por hoje"
        : `${pendingCount} de ${tasks.length} pendente${pendingCount === 1 ? "" : "s"}`;

  return (
    <CollapsibleHomeCard
      icon={
        <span className="flex size-14 shrink-0 items-center justify-center">
          <CoffeeLoader size={56} />
        </span>
      }
      title="Onde você vai trabalhar hoje?"
      status={statusLabel}
      open={open}
      onToggle={toggle}
    >
      <p className="text-xs text-[var(--muted-foreground)]">
        Só você vê essa lista, neste computador, e some à meia-noite.
      </p>

      <form
        className="mt-3 flex items-center gap-1 rounded-full bg-[var(--muted)] py-1 pl-3.5 pr-1 transition-shadow focus-within:ring-2 focus-within:ring-[var(--ring)]/40"
        onSubmit={(event) => {
          event.preventDefault();
          addTask();
        }}
      >
        <FormInput
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Adicionar tarefa..."
          aria-label="Nova tarefa"
          className="flex-1"
          inputClassName="h-7 border-0 bg-transparent p-0 text-sm shadow-none hover:bg-transparent focus:ring-0"
        />
        <Button
          type="submit"
          size="icon-sm"
          variant="ghost"
          className="rounded-full text-[var(--primary)] hover:bg-[var(--card)] disabled:opacity-30"
          aria-label="Adicionar tarefa"
          disabled={!draft.trim()}
        >
          <Plus className="size-4" aria-hidden />
        </Button>
      </form>

      {tasks.length > 0 ? (
        <ul className="mt-2 divide-y divide-[var(--border)]">
          {tasks.map((task) => (
            <li key={task.id} className="group flex items-center gap-2.5 py-2">
              <button
                type="button"
                role="checkbox"
                aria-checked={task.done}
                aria-label={
                  task.done ? "Marcar como pendente" : "Marcar como concluída"
                }
                onClick={() => toggleTask(task.id)}
                className={cn(
                  "flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-md border transition-colors",
                  task.done
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-[var(--border)] text-transparent hover:border-[var(--primary)]",
                )}
              >
                <Check className="size-3.5" aria-hidden />
              </button>

              <button
                type="button"
                onClick={() => toggleTask(task.id)}
                data-done={task.done}
                className={cn(
                  "daily-task-label min-w-0 flex-1 cursor-pointer truncate text-left text-sm transition-colors duration-300",
                  task.done
                    ? "text-[var(--muted-foreground)]"
                    : "text-[var(--foreground)]",
                )}
              >
                {task.text}
              </button>

              <button
                type="button"
                onClick={() => removeTask(task.id)}
                aria-label={`Remover tarefa: ${task.text}`}
                className="shrink-0 cursor-pointer rounded-full p-1 text-[var(--muted-foreground)] opacity-0 transition-opacity hover:text-[var(--destructive)] group-hover:opacity-100 focus-visible:opacity-100"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-[var(--muted-foreground)]">
          Sem tarefas ainda. Adicione a primeira acima.
        </p>
      )}
    </CollapsibleHomeCard>
  );
}
