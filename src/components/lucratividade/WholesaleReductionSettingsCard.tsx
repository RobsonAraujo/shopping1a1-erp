"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/ui/form-input";
import { UserFeedback } from "@/components/ui/user-feedback";
import { formatFinancialPercent } from "@/lib/pricing/financial-margin";
import {
  validateWholesaleReductionSettings,
  WHOLESALE_ANCHOR_MIN_PURCHASE_UNIT,
  type WholesaleReductionSettings,
} from "@/lib/pricing/wholesale-pricing";

type LevelConfig = {
  level: 1 | 2 | 3;
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
    isAnchor: true,
  },
  {
    level: 2,
    reductionKey: "level2ReductionPercent",
    minQtyKey: "level2MinPurchaseUnit",
  },
  {
    level: 3,
    reductionKey: "level3ReductionPercent",
    minQtyKey: "level3MinPurchaseUnit",
  },
];

function settingsToEditDraft(settings: WholesaleReductionSettings): EditDraft {
  const percent = (value: number) => String(value).replace(".", ",");
  return {
    level1ReductionPercent: percent(settings.level1ReductionPercent),
    level2ReductionPercent: percent(settings.level2ReductionPercent),
    level3ReductionPercent: percent(settings.level3ReductionPercent),
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

function levelQtyLabel(row: LevelConfig, qty: number): string {
  return row.isAnchor ? `${qty} un · âncora` : `${qty}+ un`;
}

/**
 * Faixas padrão de atacado da empresa (valem para todos os anúncios): quanto
 * da margem em R$ cada nível abre mão e a partir de quantas unidades vale.
 */
export function WholesaleReductionSettingsCard({
  values,
  onSave,
}: {
  values: WholesaleReductionSettings;
  onSave: (values: WholesaleReductionSettings) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft>(() =>
    settingsToEditDraft(values),
  );

  function startEdit() {
    setEditDraft(settingsToEditDraft(values));
    setSaveError(null);
    setEditing(true);
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
    } catch {
      setSaveError("Não foi possível salvar as faixas. Tente de novo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/10 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Faixas padrão</p>
          <p className="text-xs text-[var(--muted-foreground)]">
            Valem para todos os anúncios. A redução incide sobre a margem em R$.
          </p>
        </div>
        {!editing ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={startEdit}
          >
            <Pencil className="size-3.5" aria-hidden />
            Editar
          </Button>
        ) : null}
      </div>

      {editing ? (
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            {levelRows.map((row) => (
              <div
                key={row.level}
                className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3"
              >
                <p className="text-xs font-semibold">
                  Nível {row.level}
                  {row.isAnchor ? " · âncora" : ""}
                </p>
                <FormInput
                  id={`wholesale-${row.reductionKey}`}
                  label="Redução da margem (%)"
                  inputMode="decimal"
                  autoComplete="off"
                  disabled={saving}
                  value={editDraft[row.reductionKey]}
                  onChange={(e) =>
                    setEditDraft((d) => ({ ...d, [row.reductionKey]: e.target.value }))
                  }
                />
                <FormInput
                  id={`wholesale-${row.minQtyKey}`}
                  label={row.isAnchor ? "Qtd (fixa no ML)" : "A partir de (un.)"}
                  inputMode="numeric"
                  autoComplete="off"
                  disabled={saving || row.isAnchor}
                  readOnly={row.isAnchor}
                  value={editDraft[row.minQtyKey]}
                  onChange={(e) =>
                    setEditDraft((d) => ({ ...d, [row.minQtyKey]: e.target.value }))
                  }
                />
              </div>
            ))}
          </div>
          {saveError ? <UserFeedback>{saveError}</UserFeedback> : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? "Salvando…" : "Salvar faixas"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={() => {
                setSaveError(null);
                setEditing(false);
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {levelRows.map((row) => (
            <span
              key={row.level}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--background)] px-2.5 py-1 text-xs"
            >
              <span className="font-medium text-[var(--muted-foreground)]">
                N{row.level}
              </span>
              <span className="font-semibold tabular-nums">
                −{formatFinancialPercent(values[row.reductionKey])}
              </span>
              <span className="text-[var(--muted-foreground)]">·</span>
              <span className="tabular-nums text-[var(--muted-foreground)]">
                {levelQtyLabel(row, values[row.minQtyKey])}
              </span>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
