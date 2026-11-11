"use client";

import { useState, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  RotinaListingTargetForm,
  type ListingTargetDraft,
} from "@/components/rotina/RotinaListingTargetForm";
import type { RotinaListingTargetView } from "@/lib/rotina/view";

/**
 * "Meta deste anúncio" fora do card — na aba Anúncios dá para dar meta a
 * qualquer anúncio, mesmo sem tarefa no dia. Cada instância tem o próprio
 * estado: a tabela desenha a versão desktop e a mobile ao mesmo tempo.
 */
export function RotinaListingTargetPopover({
  catalogListing,
  target,
  disabled,
  onSave,
  children,
}: {
  catalogListing: boolean;
  target: RotinaListingTargetView;
  disabled?: boolean;
  onSave: (draft: ListingTargetDraft) => Promise<boolean>;
  /** O gatilho (recebe `asChild`). */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  return (
    <Popover open={open} onOpenChange={(next) => !saving && setOpen(next)}>
      <PopoverTrigger asChild disabled={disabled}>
        {children}
      </PopoverTrigger>
      <PopoverContent align="end" className="p-3">
        {/* Remonta a cada abertura: o formulário começa da meta gravada. */}
        {open ? (
          <RotinaListingTargetForm
            catalogListing={catalogListing}
            defaults={target.defaults}
            current={target.own}
            saving={saving}
            onCancel={() => setOpen(false)}
            onSave={async (draft) => {
              setSaving(true);
              const ok = await onSave(draft);
              setSaving(false);
              if (ok) setOpen(false);
            }}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
