"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatFinancialPercent } from "@/lib/financial-margin";
import type { WholesaleReductionSettings } from "@/lib/wholesale-pricing";
import { cn } from "@/lib/utils";

type WholesaleReductionSettingsCardProps = {
  values: WholesaleReductionSettings | null;
  loading?: boolean;
  defaultOpen?: boolean;
  onSave: (values: WholesaleReductionSettings) => Promise<void>;
};

type LevelKey =
  | "level1ReductionPercent"
  | "level2ReductionPercent"
  | "level3ReductionPercent";

type EditDraft = Record<LevelKey, string>;

const levelRows: Array<{ level: number; key: LevelKey; label: string }> = [
  { level: 1, key: "level1ReductionPercent", label: "Nível 1" },
  { level: 2, key: "level2ReductionPercent", label: "Nível 2" },
  { level: 3, key: "level3ReductionPercent", label: "Nível 3" },
];

const inputClassName =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 pr-8 text-sm tabular-nums";

function emptyDraft(): WholesaleReductionSettings {
  return {
    level1ReductionPercent: 10,
    level2ReductionPercent: 15,
    level3ReductionPercent: 20,
  };
}

function settingsToEditDraft(settings: WholesaleReductionSettings): EditDraft {
  return {
    level1ReductionPercent: String(settings.level1ReductionPercent).replace(
      ".",
      ",",
    ),
    level2ReductionPercent: String(settings.level2ReductionPercent).replace(
      ".",
      ",",
    ),
    level3ReductionPercent: String(settings.level3ReductionPercent).replace(
      ".",
      ",",
    ),
  };
}

function parsePercentInput(raw: string): number | null {
  const trimmed = raw.trim().replace(",", ".");
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

function editDraftToSettings(
  draft: EditDraft,
): WholesaleReductionSettings | null {
  const level1ReductionPercent = parsePercentInput(draft.level1ReductionPercent);
  const level2ReductionPercent = parsePercentInput(draft.level2ReductionPercent);
  const level3ReductionPercent = parsePercentInput(draft.level3ReductionPercent);

  if (
    level1ReductionPercent === null ||
    level2ReductionPercent === null ||
    level3ReductionPercent === null
  ) {
    return null;
  }

  return {
    level1ReductionPercent,
    level2ReductionPercent,
    level3ReductionPercent,
  };
}

function PercentInput({
  id,
  label,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          className={cn(inputClassName, disabled && "opacity-60")}
        />
        <span
          className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-[var(--muted-foreground)]"
          aria-hidden
        >
          %
        </span>
      </div>
    </div>
  );
}

export function WholesaleReductionSettingsCard({
  values,
  loading = false,
  defaultOpen = false,
  onSave,
}: WholesaleReductionSettingsCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft>(
    settingsToEditDraft(values ?? emptyDraft()),
  );

  useEffect(() => {
    if (!editing && values) {
      setEditDraft(settingsToEditDraft(values));
    }
  }, [values, editing]);

  function startEdit() {
    setEditDraft(settingsToEditDraft(values ?? emptyDraft()));
    setSaveError(null);
    setEditing(true);
    setOpen(true);
  }

  async function handleSave() {
    const parsed = editDraftToSettings(editDraft);
    if (!parsed) {
      setSaveError("Informe valores entre 0 e 100 em todos os níveis.");
      return;
    }

    setSaveError(null);
    setSaving(true);
    try {
      await onSave(parsed);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        className="flex w-full cursor-pointer items-center justify-between gap-3 px-6 py-4 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div>
          <p className="text-base font-semibold text-[var(--foreground)]">
            Atacado B2B
          </p>
          <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
            Redução da margem de contribuição por faixa de preço
          </p>
        </div>
        <ChevronDown
          className={cn(
            "size-5 shrink-0 text-[var(--muted-foreground)] transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <CardContent className="border-t border-[var(--border)] pt-4">
          {editing ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                {levelRows.map((row) => (
                  <PercentInput
                    key={row.key}
                    id={`wholesale-${row.key}`}
                    label={`${row.label} — redução`}
                    value={editDraft[row.key]}
                    disabled={saving}
                    onChange={(next) =>
                      setEditDraft((d) => ({ ...d, [row.key]: next }))
                    }
                  />
                ))}
              </div>
              {saveError ? (
                <p className="text-sm text-red-600" role="alert">
                  {saveError}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSave()}
                >
                  {saving ? "Salvando…" : "Salvar"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => {
                    setEditDraft(settingsToEditDraft(values ?? emptyDraft()));
                    setSaveError(null);
                    setEditing(false);
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="grid gap-2 sm:grid-cols-3 sm:gap-4">
                {levelRows.map((row) => (
                  <div key={row.key}>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {row.label}
                    </p>
                    <p className="mt-0.5 text-lg font-semibold tabular-nums">
                      {loading || !values
                        ? "—"
                        : formatFinancialPercent(values[row.key])}
                    </p>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={loading}
                onClick={startEdit}
              >
                <Pencil className="size-4" aria-hidden />
                Editar
              </Button>
            </div>
          )}
          <p className="mt-3 text-xs text-[var(--muted-foreground)]">
            Quanto reduzir da margem de contribuição atual do anúncio em cada
            faixa de preço B2B. O preço sugerido é calculado sem imposto (repasse
            ao comprador empresarial no ML).
          </p>
        </CardContent>
      ) : null}
    </Card>
  );
}
