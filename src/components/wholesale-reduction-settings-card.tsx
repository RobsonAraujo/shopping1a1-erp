"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Layers2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

const levelRows: Array<{
  level: number;
  key: LevelKey;
  label: string;
  hint: string;
}> = [
  {
    level: 1,
    key: "level1ReductionPercent",
    label: "Nível 1",
    hint: "Menor desconto — faixa inicial B2B",
  },
  {
    level: 2,
    key: "level2ReductionPercent",
    label: "Nível 2",
    hint: "Desconto intermediário",
  },
  {
    level: 3,
    key: "level3ReductionPercent",
    label: "Nível 3",
    hint: "Maior desconto — volume atacado",
  },
];

const inputClassName =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 pr-9 text-center text-lg font-semibold tabular-nums shadow-sm focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]/30";

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

function LevelPreviewBadge({
  level,
  value,
  loading,
}: {
  level: number;
  value: number | null;
  loading: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--background)] px-2.5 py-1 text-xs">
      <span className="font-medium text-[var(--muted-foreground)]">
        N{level}
      </span>
      <span className="font-semibold tabular-nums text-[var(--foreground)]">
        {loading || value === null ? "—" : formatFinancialPercent(value)}
      </span>
    </span>
  );
}

function LevelCard({
  level,
  label,
  hint,
  editing,
  value,
  displayValue,
  loading,
  disabled,
  onChange,
}: {
  level: number;
  label: string;
  hint: string;
  editing: boolean;
  value: string;
  displayValue: number | null;
  loading: boolean;
  disabled?: boolean;
  onChange?: (value: string) => void;
}) {
  const inputId = `wholesale-level-${level}`;

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border border-[var(--border)] bg-[var(--muted)]/15 p-4 shadow-sm transition-colors",
        editing && "bg-[var(--card)] ring-1 ring-[var(--border)]",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <Badge variant="secondary" className="font-semibold">
          {label}
        </Badge>
        <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
          N{level}
        </span>
      </div>

      <div className="mt-4 flex flex-1 flex-col items-center justify-center">
        {editing ? (
          <div className="relative w-full max-w-[8rem]">
            <input
              id={inputId}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              disabled={disabled}
              value={value}
              onChange={(e) => onChange?.(e.target.value)}
              placeholder="0"
              aria-label={`${label} — redução percentual`}
              className={cn(inputClassName, disabled && "opacity-60")}
            />
            <span
              className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-medium text-[var(--muted-foreground)]"
              aria-hidden
            >
              %
            </span>
          </div>
        ) : (
          <p className="text-3xl font-bold tabular-nums tracking-tight text-[var(--primary)]">
            {loading || displayValue === null
              ? "—"
              : formatFinancialPercent(displayValue)}
          </p>
        )}
        <p className="mt-2 text-center text-xs text-[var(--muted-foreground)]">
          {editing ? "redução da margem" : hint}
        </p>
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

  const resolvedValues = values ?? emptyDraft();

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
      <button
        type="button"
        className="flex w-full cursor-pointer items-start justify-between gap-4 px-4 py-4 text-left transition-colors hover:bg-[var(--muted)]/25 sm:px-5 sm:py-5"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 text-[var(--primary)]">
            <Layers2 className="size-5" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-lg font-semibold text-[var(--primary)]">
              Atacado B2B
            </span>
            <span className="mt-1 block text-sm text-[var(--muted-foreground)]">
              Redução da margem de contribuição por faixa de preço no Mercado
              Livre
            </span>
            {!open ? (
              <span className="mt-2.5 flex flex-wrap gap-1.5">
                {levelRows.map((row) => (
                  <LevelPreviewBadge
                    key={row.key}
                    level={row.level}
                    loading={loading}
                    value={values ? values[row.key] : null}
                  />
                ))}
              </span>
            ) : null}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "mt-1 size-5 shrink-0 text-[var(--muted-foreground)] transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="border-t border-[var(--border)] px-4 pb-5 pt-4 sm:px-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-[var(--foreground)]">
              {editing ? "Editar reduções por nível" : "Reduções configuradas"}
            </p>
            {!editing ? (
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
            ) : null}
          </div>

          {editing ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                {levelRows.map((row) => (
                  <LevelCard
                    key={row.key}
                    level={row.level}
                    label={row.label}
                    hint={row.hint}
                    editing
                    value={editDraft[row.key]}
                    displayValue={null}
                    loading={false}
                    disabled={saving}
                    onChange={(next) =>
                      setEditDraft((d) => ({ ...d, [row.key]: next }))
                    }
                  />
                ))}
              </div>
              {saveError ? (
                <p
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
                  role="alert"
                >
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
            <div className="grid gap-3 sm:grid-cols-3">
              {levelRows.map((row) => (
                <LevelCard
                  key={row.key}
                  level={row.level}
                  label={row.label}
                  hint={row.hint}
                  editing={false}
                  value=""
                  displayValue={loading ? null : resolvedValues[row.key]}
                  loading={loading}
                />
              ))}
            </div>
          )}

          <p className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--muted)]/10 px-3 py-2.5 text-xs leading-relaxed text-[var(--muted-foreground)]">
            Cada nível reduz o valor em R$ da margem de contribuição do
            anúncio. O preço sugerido soma taxa ML, frete, custos e essa margem
            — sem imposto (repasse ao comprador empresarial no ML).
          </p>
        </div>
      ) : null}
    </section>
  );
}
