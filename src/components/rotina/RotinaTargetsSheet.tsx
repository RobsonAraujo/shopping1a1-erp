"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/ui/form-input";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { formatPercent } from "@/lib/rotina/format";
import {
  ROTINA_RULE_KEYS,
  ROTINA_RULES,
  type RotinaRuleKey,
} from "@/lib/rotina/rule-registry";
import {
  ROTINA_MARGIN_LIMITS,
  ROTINA_TACOS_LIMITS,
  type RotinaSettings,
} from "@/lib/rotina/settings-shared";
import type { RotinaTargetOverride } from "@/lib/rotina/view";

export type RotinaTargetsDraft = {
  ownMinMarginPercent: number;
  catalogMinMarginPercent: number;
  ownTacosTargetPercent: number;
  disabledRules: RotinaRuleKey[];
};

function toNumber(raw: string): number | null {
  const value = Number(raw.trim().replace(",", "."));
  return raw.trim() !== "" && Number.isFinite(value) ? value : null;
}

/**
 * Metas da Rotina. A margem mínima é sempre **após ADS** (o que sobra depois de
 * taxa, frete, imposto, custo e ADS) e é também a meta do preço mínimo de cada
 * ação. Na primeira abertura a sheet vem com sugestões preenchidas.
 */
export function RotinaTargetsSheet({
  open,
  onOpenChange,
  settings,
  overrides,
  saving,
  onSave,
  onClearOverride,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: RotinaSettings;
  overrides: RotinaTargetOverride[];
  saving: boolean;
  onSave: (draft: RotinaTargetsDraft) => void;
  onClearOverride: (mlItemId: string) => void;
}) {
  const [ownMargin, setOwnMargin] = useState(String(settings.ownMinMarginPercent));
  const [catalogMargin, setCatalogMargin] = useState(
    String(settings.catalogMinMarginPercent),
  );
  const [tacos, setTacos] = useState(String(settings.ownTacosTargetPercent));
  const [disabled, setDisabled] = useState<Set<RotinaRuleKey>>(
    () => new Set(settings.disabledRules),
  );
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const own = toNumber(ownMargin);
    const catalog = toNumber(catalogMargin);
    const tacosValue = toNumber(tacos);
    const marginOk = (value: number | null) =>
      value !== null && value >= ROTINA_MARGIN_LIMITS.min && value <= ROTINA_MARGIN_LIMITS.max;
    if (!marginOk(own) || !marginOk(catalog)) {
      setError(
        `Margem mínima entre ${ROTINA_MARGIN_LIMITS.min}% e ${ROTINA_MARGIN_LIMITS.max}%.`,
      );
      return;
    }
    if (
      tacosValue === null ||
      tacosValue < ROTINA_TACOS_LIMITS.min ||
      tacosValue > ROTINA_TACOS_LIMITS.max
    ) {
      setError(`TACOS meta entre ${ROTINA_TACOS_LIMITS.min}% e ${ROTINA_TACOS_LIMITS.max}%.`);
      return;
    }
    setError(null);
    onSave({
      ownMinMarginPercent: own!,
      catalogMinMarginPercent: catalog!,
      ownTacosTargetPercent: tacosValue,
      disabledRules: ROTINA_RULE_KEYS.filter((rule) => disabled.has(rule)),
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Suas metas</SheetTitle>
          <SheetDescription>
            {settings.configured
              ? "O que conta como problema na sua lista do dia."
              : "Confira as sugestões e salve: é a partir delas que a Central de anúncios monta a lista do dia."}
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="space-y-6">
          <section className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <FormInput
                label="Margem mínima · Próprios (%)"
                inputMode="decimal"
                value={ownMargin}
                onChange={(event) => setOwnMargin(event.target.value)}
              />
              <FormInput
                label="Margem mínima · Catálogo (%)"
                inputMode="decimal"
                value={catalogMargin}
                onChange={(event) => setCatalogMargin(event.target.value)}
              />
              <FormInput
                label="TACOS meta · Próprios (%)"
                inputMode="decimal"
                value={tacos}
                onChange={(event) => setTacos(event.target.value)}
              />
            </div>
            <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">
              Margem mínima = margem <strong>após ADS</strong>: o que sobra depois de taxa,
              frete, imposto, custo e ADS (TACOS dos últimos 7 dias). É também a meta do
              preço mínimo de cada ação. Os cards mostram a MC ao lado.
            </p>
            <p className="text-xs text-[var(--muted-foreground)]">
              Promoção vencendo: até {settings.promotionExpiringSoonDays}{" "}
              {settings.promotionExpiringSoonDays === 1 ? "dia" : "dias"} antes do fim (
              <Link
                href="/dashboard/configuracoes/planejamento"
                className="font-medium text-[var(--primary)] underline-offset-4 hover:underline"
              >
                Configurações › Planejamento
              </Link>
              ).
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">O que entra na lista</h3>
            <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
              {ROTINA_RULE_KEYS.map((rule) => {
                const definition = ROTINA_RULES[rule];
                const enabled = !disabled.has(rule);
                const switchId = `rotina-rule-${rule}`;
                return (
                  <li key={rule} className="flex items-start gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <label
                        htmlFor={switchId}
                        className="block cursor-pointer text-sm font-medium text-[var(--foreground)]"
                      >
                        {definition.settingsLabel}
                      </label>
                      <p className="text-xs text-[var(--muted-foreground)]">
                        {definition.settingsHint}
                      </p>
                    </div>
                    <Switch
                      id={switchId}
                      checked={enabled}
                      onCheckedChange={(checked) =>
                        setDisabled((current) => {
                          const next = new Set(current);
                          if (checked) next.delete(rule);
                          else next.add(rule);
                          return next;
                        })
                      }
                    />
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">
              Metas por anúncio
            </h3>
            {overrides.length === 0 ? (
              <p className="text-xs text-[var(--muted-foreground)]">
                Nenhuma. Para dar a um anúncio uma meta diferente do padrão, use o menu ⋯
                do card dele.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {overrides.map((override) => (
                  <li
                    key={override.mlItemId}
                    className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium text-[var(--foreground)]">
                        {override.title}
                      </span>
                      {override.minMarginPercent !== null
                        ? ` · margem ${formatPercent(override.minMarginPercent)}`
                        : ""}
                      {override.tacosTargetPercent !== null
                        ? ` · TACOS ${formatPercent(override.tacosTargetPercent)}`
                        : ""}
                    </span>
                    <button
                      type="button"
                      className="shrink-0 cursor-pointer font-medium text-[var(--primary)] underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={saving}
                      onClick={() => onClearOverride(override.mlItemId)}
                    >
                      Usar padrão
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {error ? <p className="text-sm text-rose-700">{error}</p> : null}
        </SheetBody>
        <SheetFooter>
          <p className="mr-auto hidden text-xs text-[var(--muted-foreground)] sm:block">
            Mudou a margem? Os preços mínimos se ajustam no próximo Atualizar.
          </p>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            Salvar metas
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
