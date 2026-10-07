"use client";

import { useRef, useState } from "react";
import { ChevronDown, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { FormInput } from "@/components/ui/form-input";
import {
  formatFinancialPercent,
  type MarginBasis,
} from "@/lib/pricing/financial-margin";
import { cn } from "@/lib/utils";

const BASIS_OPTIONS: Array<{ id: MarginBasis; label: string; hint: string }> = [
  {
    id: "contribution",
    label: "Contribuição",
    hint: "Preço − taxa ML − frete − custo − impostos.",
  },
  {
    id: "afterAds",
    label: "Após ADS",
    hint: "Contribuição menos o gasto com Product Ads (TACOS).",
  },
];

const QUICK_TARGETS = [5, 8, 10, 15, 20];

function formatTargetInput(value: number): string {
  return String(value).replace(".", ",");
}

/** "6", "6,5", "6.5", "6 %" → número entre 0 e 100; senão null. */
export function parseTargetInput(raw: string): number | null {
  const cleaned = raw.replace("%", "").trim().replace(",", ".");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 100) / 100;
}

export function targetBasisShortLabel(basis: MarginBasis): string {
  return basis === "afterAds" ? "após ADS" : "contribuição";
}

/**
 * Meta de margem da página: define a coluna "Preço p/ meta" e o filtro
 * "Abaixo da meta". Aplicar já recalcula — não existe estado "meta alterada".
 */
export function TargetMarginPopover({
  targetMarginPercent,
  marginBasis,
  onApply,
}: {
  targetMarginPercent: number;
  marginBasis: MarginBasis;
  onApply: (target: number, basis: MarginBasis) => void;
}) {
  const [open, setOpen] = useState(false);
  // Campo de texto simples com o "%" fora do valor: o campo mascarado
  // (sufixo " %" dentro do texto) prendia o cursor e brigava com a seleção.
  const [draftText, setDraftText] = useState(() =>
    formatTargetInput(targetMarginPercent),
  );
  const [draftBasis, setDraftBasis] = useState<MarginBasis>(marginBasis);
  const inputRef = useRef<HTMLInputElement>(null);

  const draftTarget = parseTargetInput(draftText);
  const validDraft = draftTarget !== null;
  // campo vazio enquanto a pessoa digita não é erro — só não aplica
  const showInvalid = draftText.trim() !== "" && !validDraft;

  function apply() {
    if (draftTarget === null) return;
    onApply(draftTarget, draftBasis);
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setDraftText(formatTargetInput(targetMarginPercent));
          setDraftBasis(marginBasis);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="gap-2">
          <Target className="size-4 text-[var(--primary)]" aria-hidden />
          <span>
            Meta{" "}
            <span className="font-semibold tabular-nums">
              {formatFinancialPercent(targetMarginPercent)}
            </span>
            <span className="text-[var(--muted-foreground)]">
              {" "}
              · {targetBasisShortLabel(marginBasis)}
            </span>
          </span>
          <ChevronDown className="size-4 opacity-60" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 space-y-4 p-4"
        onOpenAutoFocus={(event) => {
          // foca o campo já com o número selecionado: é só digitar a nova meta
          event.preventDefault();
          inputRef.current?.focus();
          inputRef.current?.select();
        }}
      >
        <div>
          <p className="text-sm font-semibold">Meta de margem</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--muted-foreground)]">
            Quanto você quer que sobre de cada venda. Com ela mostramos quem
            está abaixo e o menor preço que entrega essa margem (coluna
            &quot;Preço p/ meta&quot;).
          </p>
        </div>
        <div className="space-y-2">
          <div className="relative">
            <FormInput
              ref={inputRef}
              id="target-margin-percent"
              label="Meta"
              inputMode="decimal"
              autoComplete="off"
              value={draftText}
              aria-invalid={showInvalid}
              inputClassName="pr-9 tabular-nums"
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) =>
                setDraftText(event.target.value.replace(/[^\d.,]/g, ""))
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  apply();
                }
              }}
            />
            <span className="pointer-events-none absolute right-3 bottom-0 flex h-11 items-center text-sm text-[var(--muted-foreground)] sm:h-10">
              %
            </span>
          </div>
          {showInvalid ? (
            <p className="text-[11px] text-rose-700">
              Informe um número entre 0 e 100.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-1.5" aria-label="Metas comuns">
            {QUICK_TARGETS.map((target) => (
              <button
                key={target}
                type="button"
                className={cn(
                  "cursor-pointer rounded-full border px-2.5 py-0.5 text-xs tabular-nums transition-colors",
                  draftTarget === target
                    ? "border-[var(--primary)]/40 bg-[var(--primary)]/10 text-[var(--primary)]"
                    : "border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
                )}
                onClick={() => setDraftText(formatTargetInput(target))}
              >
                {target}%
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-[var(--muted-foreground)]">
            Calcular sobre
          </p>
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-[var(--border)] bg-[var(--muted)]/20 p-1">
            {BASIS_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={draftBasis === option.id}
                className={cn(
                  "cursor-pointer rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                  draftBasis === option.id
                    ? "bg-[var(--card)] text-[var(--primary)] shadow-sm"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
                )}
                onClick={() => setDraftBasis(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-[var(--muted-foreground)]">
            {BASIS_OPTIONS.find((option) => option.id === draftBasis)?.hint}
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!validDraft}
            onClick={apply}
          >
            Aplicar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
