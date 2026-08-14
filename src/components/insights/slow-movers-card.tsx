"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import type { SlowMoverRow } from "@/lib/insights/types";
import { MIN_LISTING_AGE_DAYS, filterSlowMoverRows } from "@/lib/insights/slow-movers";
import { SlowMoversTable } from "@/components/insights/slow-movers-table";
import { useSlowMoverThreshold } from "@/hooks/use-slow-mover-threshold";
import { FormInput } from "@/components/ui/form-input";

export function SlowMoversCard({ allRows }: { allRows: SlowMoverRow[] }) {
  const [threshold, setThreshold] = useSlowMoverThreshold();
  const [draft, setDraft] = useState<string | null>(null);

  const rows = filterSlowMoverRows(allRows, threshold);

  function commitDraft() {
    const value = draft ?? String(threshold);
    const trimmed = value.trim();
    if (trimmed !== "") {
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) {
        setThreshold(Math.max(1, Math.floor(parsed)));
      }
    }
    setDraft(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-24">
          <FormInput
            label="Threshold (dias)"
            type="number"
            inputMode="numeric"
            min={1}
            max={365}
            value={draft ?? String(threshold)}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            inputClassName="tabular-nums h-9 sm:h-8"
          />
        </div>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
        <Info className="size-3.5 shrink-0" />
        Mostrando apenas anúncios com mais de {MIN_LISTING_AGE_DAYS} dias de vida.
      </p>

      {rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-[var(--muted-foreground)]">
          Nenhum produto acima de {threshold} dias de cobertura.
        </p>
      ) : (
        <SlowMoversTable rows={rows} threshold={threshold} />
      )}
    </div>
  );
}
