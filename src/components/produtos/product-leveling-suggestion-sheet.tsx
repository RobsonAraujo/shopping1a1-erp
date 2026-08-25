"use client";

import { useEffect, useState } from "react";
import { addDays } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { UserFeedback } from "@/components/ui/user-feedback";
import {
  localDateToYmd,
  ymdToLocalDate,
} from "@/components/ui/date-range-picker";
import { PeriodDateRangeField } from "@/components/dre/date-range-field";
import {
  DreProductCostLevelingFields,
  type DreProductCostLevelingFormValues,
} from "@/components/dre/dre-product-cost-leveling-fields";
import { readApiError } from "@/lib/api-client-error";
import type { DreProductCostLevelingView } from "@/lib/dre/dre-product-cost-leveling-shared";

function shiftYmd(ymd: string, days: number): string {
  const date = ymdToLocalDate(ymd);
  if (!date) return ymd;
  return localDateToYmd(addDays(date, days));
}

export function ProductLevelingSuggestionSheet({
  sku,
  previousValues,
  productCreatedAt,
  onClose,
}: {
  sku: string;
  previousValues: DreProductCostLevelingFormValues;
  /** ISO date string (Product.createdAt). */
  productCreatedAt: string;
  onClose: () => void;
}) {
  const [loadingRange, setLoadingRange] = useState(true);
  const [period, setPeriod] = useState<{
    startDate: string;
    endDate: string;
  } | null>(null);
  const [noValidPeriod, setNoValidPeriod] = useState(false);
  const [form, setForm] = useState<DreProductCostLevelingFormValues>(previousValues);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadSuggestedPeriod() {
      setLoadingRange(true);
      try {
        const res = await fetch(
          `/api/dre/product-cost-leveling?sku=${encodeURIComponent(sku)}`,
        );
        if (!res.ok) {
          if (!cancelled) {
            setError(await readApiError(res, "dre_product_cost_leveling_failed"));
          }
          return;
        }
        const json = (await res.json()) as {
          items?: DreProductCostLevelingView[];
        };
        const items = json.items ?? [];
        const latestEndDate = items.reduce<string | null>(
          (max, item) => (!max || item.endDate > max ? item.endDate : max),
          null,
        );
        const suggestedStart = latestEndDate
          ? shiftYmd(latestEndDate, 1)
          : productCreatedAt.slice(0, 10);
        const suggestedEnd = shiftYmd(localDateToYmd(new Date()), -1);
        if (cancelled) return;
        if (suggestedStart > suggestedEnd) {
          setNoValidPeriod(true);
        } else {
          setPeriod({ startDate: suggestedStart, endDate: suggestedEnd });
        }
      } catch {
        if (!cancelled) setError("Falha de rede ao calcular período sugerido.");
      } finally {
        if (!cancelled) setLoadingRange(false);
      }
    }
    void loadSuggestedPeriod();
    return () => {
      cancelled = true;
    };
  }, [sku, productCreatedAt]);

  async function save() {
    if (!period) return;
    if (form.hasIcmsSt) {
      if (form.purchaseCostWithSt === null) {
        setError("Informe o custo de compra somado ICMS-ST.");
        return;
      }
    } else if (form.unitCostNf === null) {
      setError("Informe o custo unitário NF.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/dre/product-cost-leveling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku,
          startDate: period.startDate,
          endDate: period.endDate,
          hasIcmsSt: form.hasIcmsSt,
          unitCostNf: form.unitCostNf ?? 0,
          purchaseCostWithSt: form.hasIcmsSt ? form.purchaseCostWithSt : null,
          ipiPercent: form.ipiPercent ?? 0,
          purchaseIcmsPercent: form.purchaseIcmsPercent,
          extraCosts: form.extraCosts,
          isMonophasic: form.isMonophasic,
          saleIcmsPercent: form.saleIcmsPercent,
          isImported: form.isImported,
          pmaPrice: form.pmaPrice,
        }),
      });
      if (!res.ok) {
        setError(
          await readApiError(res, "dre_product_cost_leveling_save_failed"),
        );
        return;
      }
      onClose();
    } catch {
      setError("Falha de rede ao salvar nivelamento.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Registrar nivelamento do custo anterior?</SheetTitle>
          <SheetDescription>
            O custo de <span className="font-medium">{sku}</span> mudou.
            Registre um nivelamento pra manter o DRE correto nos meses
            anteriores a esta edição — os valores abaixo são os que estavam
            cadastrados até agora.
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="space-y-4">
          {error ? <UserFeedback>{error}</UserFeedback> : null}

          {loadingRange ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              Calculando período…
            </p>
          ) : noValidPeriod ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              Não há período livre pra sugerir — já existe um nivelamento
              cobrindo até hoje para este SKU. Se precisar, cadastre
              manualmente em &quot;Nivelar custos&quot;, no DRE.
            </p>
          ) : (
            <>
              <PeriodDateRangeField
                startDate={period!.startDate}
                endDate={period!.endDate}
                disabled={busy}
                onChange={(startDate, endDate) =>
                  setPeriod({ startDate, endDate })
                }
              />
              <DreProductCostLevelingFields
                idPrefix="product-leveling-suggestion"
                form={form}
                onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
                busy={busy}
              />
            </>
          )}
        </SheetBody>
        <SheetFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={busy}
          >
            Descartar
          </Button>
          {!loadingRange && !noValidPeriod ? (
            <Button type="button" onClick={() => void save()} disabled={busy}>
              Salvar nivelamento
            </Button>
          ) : null}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
