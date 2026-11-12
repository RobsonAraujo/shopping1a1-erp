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
import { SegmentTag } from "@/components/rotina/SegmentTag";
import { RULE_VISUALS, ruleIconClass } from "@/components/rotina/rule-visuals";
import { formatPercent } from "@/lib/rotina/format";
import {
  ROTINA_RULE_KEYS,
  ROTINA_RULES,
  type RotinaRuleKey,
} from "@/lib/rotina/rule-registry";
import {
  ROTINA_MARGIN_LIMITS,
  ROTINA_RAISE_CUSHION_LIMITS,
  ROTINA_RAISE_MIN_LIMITS,
  ROTINA_TACOS_LIMITS,
  type RotinaSettings,
} from "@/lib/rotina/settings-shared";
import type { RotinaTargetOverride } from "@/lib/rotina/view";
import { cn } from "@/lib/utils";

const SECTION_TITLE_CLASS = "text-sm font-semibold text-[var(--foreground)]";

/** Campo de % da matriz de metas: rótulo vai para leitores de tela, o "%" fica à vista. */
function PercentField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative">
      <FormInput
        aria-label={label}
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputClassName="pr-8 tabular-nums"
      />
      <span
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted-foreground)]"
        aria-hidden
      >
        %
      </span>
    </div>
  );
}

export type RotinaTargetsDraft = {
  ownMinMarginPercent: number;
  catalogMinMarginPercent: number;
  ownTacosTargetPercent: number;
  catalogRaiseCushionPercent: number;
  catalogRaiseMinPercent: number;
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
  const [raiseCushion, setRaiseCushion] = useState(String(settings.catalogRaiseCushionPercent));
  const [raiseMin, setRaiseMin] = useState(String(settings.catalogRaiseMinPercent));
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
    const cushionValue = toNumber(raiseCushion);
    if (
      cushionValue === null ||
      cushionValue < ROTINA_RAISE_CUSHION_LIMITS.min ||
      cushionValue > ROTINA_RAISE_CUSHION_LIMITS.max
    ) {
      setError(
        `Folga abaixo do mais barato entre ${ROTINA_RAISE_CUSHION_LIMITS.min}% e ${ROTINA_RAISE_CUSHION_LIMITS.max}%.`,
      );
      return;
    }
    const raiseMinValue = toNumber(raiseMin);
    if (
      raiseMinValue === null ||
      raiseMinValue < ROTINA_RAISE_MIN_LIMITS.min ||
      raiseMinValue > ROTINA_RAISE_MIN_LIMITS.max
    ) {
      setError(
        `Alta mínima entre ${ROTINA_RAISE_MIN_LIMITS.min}% e ${ROTINA_RAISE_MIN_LIMITS.max}%.`,
      );
      return;
    }
    setError(null);
    onSave({
      ownMinMarginPercent: own!,
      catalogMinMarginPercent: catalog!,
      ownTacosTargetPercent: tacosValue,
      catalogRaiseCushionPercent: cushionValue,
      catalogRaiseMinPercent: raiseMinValue,
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
            <h3 className={SECTION_TITLE_CLASS}>Margens e TACOS</h3>
            <div className="overflow-hidden rounded-xl border border-[var(--border)]">
              <div className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-3 border-b border-[var(--border)] bg-[var(--muted)]/40 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                <span>Segmento</span>
                <span>Margem mín. após ADS</span>
                <span>TACOS meta</span>
              </div>
              <div className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-3 border-b border-[var(--border)] px-3 py-2.5">
                <SegmentTag segment="own" className="justify-self-start" />
                <PercentField
                  label="Margem mínima · Próprios (%)"
                  value={ownMargin}
                  onChange={setOwnMargin}
                />
                <PercentField
                  label="TACOS meta · Próprios (%)"
                  value={tacos}
                  onChange={setTacos}
                />
              </div>
              <div className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-3 px-3 py-2.5">
                <SegmentTag segment="catalog" className="justify-self-start" />
                <PercentField
                  label="Margem mínima · Catálogo (%)"
                  value={catalogMargin}
                  onChange={setCatalogMargin}
                />
                <span className="text-xs text-[var(--muted-foreground)]">não se aplica</span>
              </div>
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

          <section className="space-y-3">
            <h3 className={SECTION_TITLE_CLASS}>Subir preço no catálogo</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="block text-xs font-medium text-[var(--foreground)]">
                  Folga abaixo do concorrente mais barato
                </span>
                <PercentField
                  label="Folga abaixo do concorrente mais barato (%)"
                  value={raiseCushion}
                  onChange={setRaiseCushion}
                />
              </label>
              <label className="space-y-1.5">
                <span className="block text-xs font-medium text-[var(--foreground)]">
                  Alta mínima para virar tarefa
                </span>
                <PercentField
                  label="Alta mínima para virar tarefa (%)"
                  value={raiseMin}
                  onChange={setRaiseMin}
                />
              </label>
            </div>
            <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">
              É uma <strong>estimativa</strong>: o ML não publica como pesa preço, entrega e
              reputação. O teto para ganhar sozinho é o concorrente mais barato menos a folga;
              no mesmo preço dele, o normal é dividir o 1º lugar. Em leituras reais do ML,
              tomar a vitrine exigiu em geral ficar de 1% a 3% abaixo de quem ganhava, mas
              quando o concorrente tinha vantagens que a lista não mostra (como entrega no
              mesmo dia), o ML chegou a pedir 12% abaixo. Depois de subir, confira se continua
              ganhando.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className={SECTION_TITLE_CLASS}>O que entra na lista</h3>
            <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)]">
              {ROTINA_RULE_KEYS.map((rule) => {
                const definition = ROTINA_RULES[rule];
                const visual = RULE_VISUALS[rule];
                const Icon = visual.icon;
                const enabled = !disabled.has(rule);
                const switchId = `rotina-rule-${rule}`;
                return (
                  <li
                    key={rule}
                    className={cn(
                      "flex items-start gap-3 px-3 py-2.5 transition-opacity",
                      !enabled && "opacity-60",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg",
                        ruleIconClass(rule),
                      )}
                    >
                      <Icon className="size-3.5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <label
                          htmlFor={switchId}
                          className="cursor-pointer text-sm font-medium text-[var(--foreground)]"
                        >
                          {definition.settingsLabel}
                        </label>
                        {definition.segments.map((segment) => (
                          <SegmentTag key={segment} segment={segment} />
                        ))}
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
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
            <h3 className={SECTION_TITLE_CLASS}>Metas por anúncio</h3>
            {overrides.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--border)] px-3 py-3 text-xs text-[var(--muted-foreground)]">
                Nenhuma. Para dar a um anúncio uma meta diferente do padrão, use o menu ⋯
                do card dele ou o botão de meta na aba Anúncios.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)]">
                {overrides.map((override) => (
                  <li
                    key={override.mlItemId}
                    className="flex items-center gap-2 px-3 py-2 text-xs text-[var(--muted-foreground)]"
                  >
                    <SegmentTag segment={override.catalogListing ? "catalog" : "own"} />
                    <span className="min-w-0 flex-1 truncate font-medium text-[var(--foreground)]">
                      {override.title}
                    </span>
                    {override.minMarginPercent !== null ? (
                      <span className="shrink-0 rounded-full bg-[var(--muted)] px-2 py-0.5 tabular-nums">
                        margem {formatPercent(override.minMarginPercent)}
                      </span>
                    ) : null}
                    {override.tacosTargetPercent !== null ? (
                      <span className="shrink-0 rounded-full bg-[var(--muted)] px-2 py-0.5 tabular-nums">
                        TACOS {formatPercent(override.tacosTargetPercent)}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      className="shrink-0 cursor-pointer rounded font-medium text-[var(--primary)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50"
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
