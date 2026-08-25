"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  MaskedMoneyField,
  MaskedPercentField,
} from "@/components/financial-cost-input-fields";
import { computeLevelingPricingCost } from "@/lib/dre/dre-product-cost-leveling-shared";
import { formatFinancialMoney } from "@/lib/financial-margin";

/**
 * Valores de custo do nivelamento — os 4 campos originais (únicos usados no
 * cálculo do DRE hoje) + os 6 campos extras do cadastro de produto (histórico
 * completo, exceto NCM que não varia no tempo; ainda não lidos pelo DRE).
 */
export type DreProductCostLevelingFormValues = {
  hasIcmsSt: boolean;
  unitCostNf: number | null;
  purchaseCostWithSt: number | null;
  ipiPercent: number | null;
  purchaseIcmsPercent: number | null;
  extraCosts: number | null;
  isMonophasic: boolean | null;
  saleIcmsPercent: number | null;
  isImported: boolean | null;
  pmaPrice: number | null;
};

export function DreProductCostLevelingFields({
  idPrefix = "dre-leveling",
  form,
  onChange,
  busy,
}: {
  idPrefix?: string;
  form: DreProductCostLevelingFormValues;
  onChange: (patch: Partial<DreProductCostLevelingFormValues>) => void;
  busy?: boolean;
}) {
  const [showMore, setShowMore] = useState(false);

  const previewCost = computeLevelingPricingCost({
    hasIcmsSt: form.hasIcmsSt,
    unitCostNf: form.unitCostNf ?? 0,
    purchaseCostWithSt: form.purchaseCostWithSt,
    ipiPercent: form.ipiPercent ?? 0,
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Switch
          id={`${idPrefix}-st`}
          checked={form.hasIcmsSt}
          onCheckedChange={(checked) => onChange({ hasIcmsSt: checked })}
          disabled={busy}
        />
        <label
          htmlFor={`${idPrefix}-st`}
          className="text-sm text-[var(--foreground)]"
        >
          ICMS-ST
        </label>
      </div>

      {form.hasIcmsSt ? (
        <MaskedMoneyField
          id={`${idPrefix}-st-cost`}
          label="Custo de compra somado ICMS-ST"
          value={form.purchaseCostWithSt}
          onValueChange={(v) => onChange({ purchaseCostWithSt: v })}
          readOnly={busy}
        />
      ) : (
        <MaskedMoneyField
          id={`${idPrefix}-nf`}
          label="Custo unitário NF"
          value={form.unitCostNf}
          onValueChange={(v) => onChange({ unitCostNf: v })}
          readOnly={busy}
        />
      )}

      <p className="text-xs text-[var(--muted-foreground)]">
        Custo efetivo:{" "}
        <span className="font-semibold text-[var(--foreground)]">
          {previewCost === null ? "—" : formatFinancialMoney(previewCost)}
        </span>
      </p>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 px-1 text-xs text-[var(--muted-foreground)]"
        onClick={() => setShowMore((prev) => !prev)}
      >
        {showMore ? (
          <ChevronUp className="size-3.5" aria-hidden />
        ) : (
          <ChevronDown className="size-3.5" aria-hidden />
        )}
        {showMore ? "Ver menos campos" : "Ver mais campos"}
      </Button>

      {showMore ? (
        <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 p-3">
          <p className="text-xs text-[var(--muted-foreground)]">
            Histórico completo do cadastro do produto neste período. Não
            afeta o cálculo do DRE hoje.
          </p>
          <MaskedPercentField
            id={`${idPrefix}-purchase-icms`}
            label="ICMS da compra"
            value={form.purchaseIcmsPercent}
            onValueChange={(v) => onChange({ purchaseIcmsPercent: v })}
            readOnly={busy}
          />
          <MaskedPercentField
            id={`${idPrefix}-ipi`}
            label="IPI"
            value={form.ipiPercent}
            onValueChange={(v) => onChange({ ipiPercent: v })}
            readOnly={busy}
          />
          <MaskedMoneyField
            id={`${idPrefix}-extra-costs`}
            label="Custos extras"
            value={form.extraCosts}
            onValueChange={(v) => onChange({ extraCosts: v })}
            readOnly={busy}
          />
          <div className="flex items-center gap-2">
            <Switch
              id={`${idPrefix}-monophasic`}
              checked={form.isMonophasic ?? false}
              onCheckedChange={(checked) => onChange({ isMonophasic: checked })}
              disabled={busy}
            />
            <label
              htmlFor={`${idPrefix}-monophasic`}
              className="text-sm text-[var(--foreground)]"
            >
              Monofásico
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id={`${idPrefix}-imported`}
              checked={form.isImported ?? false}
              onCheckedChange={(checked) => onChange({ isImported: checked })}
              disabled={busy}
            />
            <label
              htmlFor={`${idPrefix}-imported`}
              className="text-sm text-[var(--foreground)]"
            >
              Produto importado
            </label>
          </div>
          <MaskedPercentField
            id={`${idPrefix}-sale-icms`}
            label="Imposto venda ICMS"
            value={form.saleIcmsPercent}
            onValueChange={(v) => onChange({ saleIcmsPercent: v })}
            readOnly={busy}
          />
          <MaskedMoneyField
            id={`${idPrefix}-pma`}
            label="PMA (preço máximo autorizado)"
            value={form.pmaPrice}
            onValueChange={(v) => onChange({ pmaPrice: v })}
            readOnly={busy}
          />
        </div>
      ) : null}
    </div>
  );
}
