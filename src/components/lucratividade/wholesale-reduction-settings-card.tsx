"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Layers2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatFinancialPercent } from "@/lib/financial-margin";
import {
  DEFAULT_WHOLESALE_REDUCTIONS,
  validateWholesaleReductionSettings,
  WHOLESALE_ANCHOR_MIN_PURCHASE_UNIT,
  type WholesaleReductionSettings,
} from "@/lib/wholesale-pricing";
import { cn } from "@/lib/utils";

type WholesaleReductionSettingsCardProps = {
  values: WholesaleReductionSettings | null;
  loading?: boolean;
  defaultOpen?: boolean;
  onSave: (values: WholesaleReductionSettings) => Promise<void>;
};

type LevelConfig = {
  level: number;
  reductionKey: keyof Pick<
    WholesaleReductionSettings,
    | "level1ReductionPercent"
    | "level2ReductionPercent"
    | "level3ReductionPercent"
  >;
  minQtyKey: keyof Pick<
    WholesaleReductionSettings,
    | "level1MinPurchaseUnit"
    | "level2MinPurchaseUnit"
    | "level3MinPurchaseUnit"
  >;
  label: string;
  hint: string;
  isAnchor?: boolean;
};

type EditDraft = Record<
  LevelConfig["reductionKey"] | LevelConfig["minQtyKey"],
  string
>;

const levelRows: LevelConfig[] = [
  {
    level: 1,
    reductionKey: "level1ReductionPercent",
    minQtyKey: "level1MinPurchaseUnit",
    label: "Nível 1 · Âncora",
    hint: "Preço sugerido enviado na âncora ML (1 un.)",
    isAnchor: true,
  },
  {
    level: 2,
    reductionKey: "level2ReductionPercent",
    minQtyKey: "level2MinPurchaseUnit",
    label: "Nível 2",
    hint: "Desconto intermediário",
  },
  {
    level: 3,
    reductionKey: "level3ReductionPercent",
    minQtyKey: "level3MinPurchaseUnit",
    label: "Nível 3",
    hint: "Maior desconto — volume atacado",
  },
];

const fieldInputClassName =
  "h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-center text-base font-semibold tabular-nums shadow-sm focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]/30 sm:h-10 sm:text-sm";

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
    level1MinPurchaseUnit: String(settings.level1MinPurchaseUnit),
    level2MinPurchaseUnit: String(settings.level2MinPurchaseUnit),
    level3MinPurchaseUnit: String(settings.level3MinPurchaseUnit),
  };
}

function parsePercentInput(raw: string): number | null {
  const trimmed = raw.trim().replace(",", ".");
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

function parseDiscountMinQtyInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 2) return null;
  return n;
}

function editDraftToSettings(
  draft: EditDraft,
): WholesaleReductionSettings | null {
  const level1ReductionPercent = parsePercentInput(draft.level1ReductionPercent);
  const level2ReductionPercent = parsePercentInput(draft.level2ReductionPercent);
  const level3ReductionPercent = parsePercentInput(draft.level3ReductionPercent);
  const level2MinPurchaseUnit = parseDiscountMinQtyInput(
    draft.level2MinPurchaseUnit,
  );
  const level3MinPurchaseUnit = parseDiscountMinQtyInput(
    draft.level3MinPurchaseUnit,
  );

  if (
    level1ReductionPercent === null ||
    level2ReductionPercent === null ||
    level3ReductionPercent === null ||
    level2MinPurchaseUnit === null ||
    level3MinPurchaseUnit === null
  ) {
    return null;
  }

  return {
    level1ReductionPercent,
    level2ReductionPercent,
    level3ReductionPercent,
    level1MinPurchaseUnit: WHOLESALE_ANCHOR_MIN_PURCHASE_UNIT,
    level2MinPurchaseUnit,
    level3MinPurchaseUnit,
  };
}

function LevelPreviewBadge({
  level,
  reduction,
  minQty,
  loading,
}: {
  level: number;
  reduction: number | null;
  minQty: number | null;
  loading: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--background)] px-2.5 py-1 text-xs">
      <span className="font-medium text-[var(--muted-foreground)]">
        N{level}
      </span>
      <span className="font-semibold tabular-nums text-[var(--foreground)]">
        {loading || reduction === null
          ? "—"
          : formatFinancialPercent(reduction)}
      </span>
      <span className="text-[var(--muted-foreground)]">·</span>
      <span className="tabular-nums text-[var(--muted-foreground)]">
        {loading || minQty === null ? "—" : `${minQty} un`}
      </span>
    </span>
  );
}

function LevelCard({
  row,
  editing,
  reductionValue,
  minQtyValue,
  displayReduction,
  displayMinQty,
  loading,
  disabled,
  onReductionChange,
  onMinQtyChange,
  minQtyLocked,
}: {
  row: LevelConfig;
  editing: boolean;
  reductionValue: string;
  minQtyValue: string;
  displayReduction: number | null;
  displayMinQty: number | null;
  loading: boolean;
  disabled?: boolean;
  onReductionChange?: (value: string) => void;
  onMinQtyChange?: (value: string) => void;
  minQtyLocked?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border border-[var(--border)] bg-[var(--muted)]/15 p-4 shadow-sm transition-colors",
        editing && "bg-[var(--card)] ring-1 ring-[var(--border)]",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <Badge variant="secondary" className="font-semibold">
          {row.label}
        </Badge>
        <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
          N{row.level}
        </span>
      </div>

      {editing ? (
        <div className="mt-4 space-y-3">
          <div>
            <label
              htmlFor={`wholesale-${row.reductionKey}`}
              className="mb-1 block text-center text-xs text-[var(--muted-foreground)]"
            >
              Redução da margem
            </label>
            <div className="relative">
              <input
                id={`wholesale-${row.reductionKey}`}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                disabled={disabled}
                value={reductionValue}
                onChange={(e) => onReductionChange?.(e.target.value)}
                className={cn(fieldInputClassName, "pr-8", disabled && "opacity-60")}
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-[var(--muted-foreground)]">
                %
              </span>
            </div>
          </div>
          <div>
            <label
              htmlFor={`wholesale-${row.minQtyKey}`}
              className="mb-1 block text-center text-xs text-[var(--muted-foreground)]"
            >
              {row.isAnchor ? "Qtd mín. âncora (ML)" : "Qtd mínima no ML"}
            </label>
            <input
              id={`wholesale-${row.minQtyKey}`}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              disabled={disabled || minQtyLocked}
              readOnly={minQtyLocked}
              value={minQtyValue}
              onChange={(e) => onMinQtyChange?.(e.target.value)}
              className={cn(
                fieldInputClassName,
                (disabled || minQtyLocked) && "opacity-60",
              )}
            />
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-1 flex-col items-center justify-center text-center">
          <p className="text-3xl font-bold tabular-nums tracking-tight text-[var(--primary)]">
            {loading || displayReduction === null
              ? "—"
              : formatFinancialPercent(displayReduction)}
          </p>
          <p className="mt-1 text-sm font-medium tabular-nums text-[var(--foreground)]">
            {loading || displayMinQty === null
              ? "—"
              : `a partir de ${displayMinQty} un`}
          </p>
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">
            {row.hint}
          </p>
        </div>
      )}
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
    settingsToEditDraft(values ?? DEFAULT_WHOLESALE_REDUCTIONS),
  );

  useEffect(() => {
    if (!editing && values) {
      setEditDraft(settingsToEditDraft(values));
    }
  }, [values, editing]);

  function startEdit() {
    setEditDraft(settingsToEditDraft(values ?? DEFAULT_WHOLESALE_REDUCTIONS));
    setSaveError(null);
    setEditing(true);
    setOpen(true);
  }

  async function handleSave() {
    const parsed = editDraftToSettings(editDraft);
    if (!parsed) {
      setSaveError(
        "Informe redução entre 0 e 100% e quantidade mínima inteira ≥ 2 nos níveis 2 e 3.",
      );
      return;
    }

    const validationError = validateWholesaleReductionSettings(parsed);
    if (validationError) {
      setSaveError(validationError);
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

  const resolvedValues = values ?? DEFAULT_WHOLESALE_REDUCTIONS;

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
              Redução da margem e quantidade mínima por faixa no Mercado Livre
            </span>
            {!open ? (
              <span className="mt-2.5 flex flex-wrap gap-1.5">
                {levelRows.map((row) => (
                  <LevelPreviewBadge
                    key={row.reductionKey}
                    level={row.level}
                    loading={loading}
                    reduction={values ? values[row.reductionKey] : null}
                    minQty={values ? values[row.minQtyKey] : null}
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
              {editing ? "Editar faixas de atacado" : "Faixas configuradas"}
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
                    key={row.reductionKey}
                    row={row}
                    editing
                    reductionValue={editDraft[row.reductionKey]}
                    minQtyValue={editDraft[row.minQtyKey]}
                    displayReduction={null}
                    displayMinQty={null}
                    loading={false}
                    disabled={saving}
                    minQtyLocked={row.isAnchor}
                    onReductionChange={(next) =>
                      setEditDraft((d) => ({ ...d, [row.reductionKey]: next }))
                    }
                    onMinQtyChange={(next) =>
                      setEditDraft((d) => ({ ...d, [row.minQtyKey]: next }))
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
                    setEditDraft(
                      settingsToEditDraft(values ?? DEFAULT_WHOLESALE_REDUCTIONS),
                    );
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
                  key={row.reductionKey}
                  row={row}
                  editing={false}
                  reductionValue=""
                  minQtyValue=""
                  displayReduction={
                    loading ? null : resolvedValues[row.reductionKey]
                  }
                  displayMinQty={loading ? null : resolvedValues[row.minQtyKey]}
                  loading={loading}
                />
              ))}
            </div>
          )}

          <p className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--muted)]/10 px-3 py-2.5 text-xs leading-relaxed text-[var(--muted-foreground)]">
            A redução incide sobre o valor em R$ da margem de contribuição. O
            nível 1 é enviado na âncora ML (1 un.). Os níveis 2 e 3 definem
            faixas adicionais de desconto B2B.
          </p>
        </div>
      ) : null}
    </section>
  );
}
