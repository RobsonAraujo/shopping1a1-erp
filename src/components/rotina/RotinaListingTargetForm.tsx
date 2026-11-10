"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/ui/form-input";
import { formatPercent } from "@/lib/rotina/format";
import {
  ROTINA_MARGIN_LIMITS,
  ROTINA_TACOS_LIMITS,
} from "@/lib/rotina/settings-shared";

export type ListingTargetDraft = {
  minMarginPercent: number | null;
  tacosTargetPercent: number | null;
};

function parsePercent(raw: string): number | null | "invalid" {
  const trimmed = raw.trim().replace(",", ".");
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : "invalid";
}

/**
 * Meta de UM anúncio (exceção ao padrão do segmento). Campo vazio = usa o
 * padrão. TACOS só aparece em anúncio próprio — a regra de TACOS é dos próprios.
 */
export function RotinaListingTargetForm({
  catalogListing,
  defaults,
  current,
  saving,
  onSave,
  onCancel,
}: {
  catalogListing: boolean;
  defaults: { minMarginPercent: number; tacosTargetPercent: number };
  current: ListingTargetDraft;
  saving: boolean;
  onSave: (draft: ListingTargetDraft) => void;
  onCancel: () => void;
}) {
  const [margin, setMargin] = useState(
    current.minMarginPercent === null ? "" : String(current.minMarginPercent),
  );
  const [tacos, setTacos] = useState(
    current.tacosTargetPercent === null ? "" : String(current.tacosTargetPercent),
  );
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const minMarginPercent = parsePercent(margin);
    const tacosTargetPercent = catalogListing ? null : parsePercent(tacos);
    if (
      minMarginPercent === "invalid" ||
      (minMarginPercent !== null &&
        (minMarginPercent < ROTINA_MARGIN_LIMITS.min ||
          minMarginPercent > ROTINA_MARGIN_LIMITS.max))
    ) {
      setError(
        `Margem entre ${ROTINA_MARGIN_LIMITS.min}% e ${ROTINA_MARGIN_LIMITS.max}%.`,
      );
      return;
    }
    if (
      tacosTargetPercent === "invalid" ||
      (tacosTargetPercent !== null &&
        (tacosTargetPercent < ROTINA_TACOS_LIMITS.min ||
          tacosTargetPercent > ROTINA_TACOS_LIMITS.max))
    ) {
      setError(`TACOS entre ${ROTINA_TACOS_LIMITS.min}% e ${ROTINA_TACOS_LIMITS.max}%.`);
      return;
    }
    setError(null);
    onSave({ minMarginPercent, tacosTargetPercent });
  }

  return (
    <form
      className="w-64 space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <p className="text-xs font-semibold text-[var(--foreground)]">Meta deste anúncio</p>
      <FormInput
        label="Margem mínima após ADS (%)"
        inputMode="decimal"
        value={margin}
        placeholder={`Padrão: ${formatPercent(defaults.minMarginPercent)}`}
        onChange={(event) => setMargin(event.target.value)}
      />
      {!catalogListing ? (
        <FormInput
          label="TACOS meta (%)"
          inputMode="decimal"
          value={tacos}
          placeholder={`Padrão: ${formatPercent(defaults.tacosTargetPercent)}`}
          onChange={(event) => setTacos(event.target.value)}
        />
      ) : null}
      <p className="text-[11px] leading-relaxed text-[var(--muted-foreground)]">
        Vazio = usa o padrão. Ao salvar, o preço mínimo deste anúncio é recalculado.
      </p>
      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={saving}>
          Salvar
        </Button>
      </div>
    </form>
  );
}
