"use client";

import { Button } from "@/components/ui/button";
import { FormSelect } from "@/components/ui/form-select";
import { BRAZILIAN_UF_OPTIONS } from "@/lib/tax-report/brazilian-ufs";
import type { DifalCollectionMode } from "@/lib/tax-report/types";
import { cn } from "@/lib/utils";

const MODE_OPTIONS: Array<{ value: DifalCollectionMode; label: string }> = [
  { value: "all", label: "Recolho em todos os estados" },
  { value: "none", label: "Não recolho" },
  { value: "some", label: "Recolho só em alguns estados" },
];

/** Texto curto da configuração de DIFAL (visão só leitura). */
export function difalCollectionLabel(
  mode: DifalCollectionMode | undefined,
  ufs: readonly string[] | undefined,
): string {
  if (!mode || mode === "all") return "Recolho em todos os estados";
  if (mode === "none") return "Não recolho";
  const list = [...(ufs ?? [])].sort();
  return list.length > 0 ? `Recolho só em ${list.join(", ")}` : "Recolho só em alguns estados";
}

/**
 * Onde a empresa recolhe o DIFAL (EC 87/2015) das vendas interestaduais a
 * consumidor final. Onde não recolhe, o Tributário mostra o DIFAL à parte e o
 * deixa fora do imposto das margens, do DRE e da Calculadora.
 */
export function DifalCollectionField({
  mode,
  ufs,
  originUf,
  onChange,
}: {
  mode: DifalCollectionMode;
  ufs: readonly string[];
  /** UF da empresa — venda para ela é interna, sem DIFAL. */
  originUf: string;
  onChange: (next: { mode: DifalCollectionMode; ufs: string[] }) => void;
}) {
  const destinations = BRAZILIAN_UF_OPTIONS.filter((o) => o.value !== originUf);
  const selected = new Set(ufs);

  return (
    <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-3 sm:col-span-2 lg:col-span-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <FormSelect
          id="tax-config-difal-collection"
          label="DIFAL nas vendas a consumidor final de outro estado"
          value={mode}
          onValueChange={(value) =>
            onChange({ mode: value as DifalCollectionMode, ufs: [...ufs] })
          }
          options={MODE_OPTIONS}
          triggerClassName="w-full"
        />
        <p className="text-[11px] leading-snug text-[var(--muted-foreground)] sm:pt-6">
          O DIFAL é devido por lei (EC 87/2015, LC 190/2022). Onde você não
          recolhe, o Tributário continua calculando e mostra quanto ficou sem
          recolher em cada mês, mas tira esse valor do imposto das margens, do
          DRE e da Calculadora. O DIFAL que o Mercado Livre cobrar na fatura
          entra no DRE como Tarifas especiais.
        </p>
      </div>

      {mode === "some" ? (
        <div className="space-y-2">
          <p className="text-xs text-[var(--muted-foreground)]">
            Marque os estados em que você recolhe o DIFAL (ex.: onde tem
            inscrição estadual de substituto).
          </p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Estados em que recolho o DIFAL">
            {destinations.map((option) => {
              const on = selected.has(option.value);
              return (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={on ? "secondary" : "outline"}
                  aria-pressed={on}
                  className={cn(
                    "h-8 min-w-11 px-2 text-xs sm:h-8",
                    on && "ring-1 ring-[var(--primary)]",
                  )}
                  onClick={() => {
                    const next = new Set(selected);
                    if (on) next.delete(option.value);
                    else next.add(option.value);
                    onChange({ mode, ufs: [...next].sort() });
                  }}
                >
                  {option.value}
                </Button>
              );
            })}
          </div>
          {selected.size === 0 ? (
            <p className="text-[11px] text-[var(--muted-foreground)]">
              Nenhum estado marcado — é o mesmo que &quot;Não recolho&quot;.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
