"use client";

import { useState } from "react";
import { NotebookPen, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CollapsibleHomeCard } from "@/components/home/CollapsibleHomeCard";
import { usePersistedJson } from "@/hooks/use-persisted-json";
import { usePersistedOpen } from "@/hooks/use-persisted-open";

type QuickNote = {
  id: string;
  text: string;
};

const EMPTY_NOTES: QuickNote[] = [];

export function DashboardQuickNotes() {
  const [notes, setNotes] = usePersistedJson<QuickNote[]>(
    "dashboard-quick-notes-list",
    EMPTY_NOTES,
  );
  const { open, toggle } = usePersistedOpen(
    "dashboard-quick-notes-open",
    false,
  );
  const [draft, setDraft] = useState("");

  function addNote() {
    const text = draft.trim();
    if (!text) return;
    setNotes([{ id: crypto.randomUUID(), text }, ...notes]);
    setDraft("");
  }

  function removeNote(id: string) {
    setNotes(notes.filter((note) => note.id !== id));
  }

  const status =
    notes.length === 0
      ? "Vazio — toque para escrever"
      : `${notes.length} nota${notes.length === 1 ? "" : "s"} salva${notes.length === 1 ? "" : "s"}`;

  return (
    <CollapsibleHomeCard
      icon={
        <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
          <NotebookPen className="size-6" aria-hidden />
        </span>
      }
      title="Notas rápidas"
      status={status}
      open={open}
      onToggle={toggle}
    >
      <p className="text-xs text-[var(--muted-foreground)]">
        Use pro seu dia a dia, não pra guardar informação importante, e fica só
        neste navegador e some se trocar de aparelho ou limpar o cache.
      </p>

      <form
        className="mt-3 flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          addNote();
        }}
      >
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              addNote();
            }
          }}
          placeholder="Escreva uma nota... (Cmd/Ctrl+Enter pra adicionar)"
          rows={2}
          aria-label="Nova nota"
          className="w-full resize-none rounded-2xl bg-[var(--muted)] p-3 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:ring-2 focus:ring-[var(--ring)]/40 focus:outline-none"
        />
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          className="self-end"
          disabled={!draft.trim()}
        >
          <Plus className="size-4" aria-hidden />
          Adicionar
        </Button>
      </form>

      {notes.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {notes.map((note) => (
            <li
              key={note.id}
              className="group flex items-start gap-2 rounded-2xl bg-[var(--muted)] p-2.5"
            >
              <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm text-[var(--foreground)]">
                {note.text}
              </p>
              <button
                type="button"
                onClick={() => removeNote(note.id)}
                aria-label="Remover nota"
                className="shrink-0 cursor-pointer rounded-full p-1 text-[var(--muted-foreground)] opacity-0 transition-opacity hover:text-[var(--destructive)] group-hover:opacity-100 focus-visible:opacity-100"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </CollapsibleHomeCard>
  );
}
