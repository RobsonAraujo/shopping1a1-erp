"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Layers2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { UserFeedback } from "@/components/ui/user-feedback";
import { readApiError } from "@/lib/api/api-client-error";
import type { FinancialEvaluationRow } from "@/lib/lucratividade/financial-evaluation-data";
import {
  formatFinancialMoney,
  formatFinancialPercent,
} from "@/lib/pricing/financial-margin";
import {
  computeWholesalePricesForListing,
  displayMinPurchaseUnitForLevel,
  isWholesaleAnchorLevel,
  mlDiscountMinPurchaseUnitForLevel,
  wholesaleReductionsToTuple,
  type WholesalePriceLevelReason,
  type WholesaleReductionSettings,
} from "@/lib/pricing/wholesale-pricing";
import { WholesaleReductionSettingsCard } from "@/components/lucratividade/WholesaleReductionSettingsCard";
import type { LiveListingRowState } from "@/components/lucratividade/hooks/useLiveListingRow";

type Level = 1 | 2 | 3;

function levelReasonLabel(reason: WholesalePriceLevelReason): string {
  switch (reason) {
    case "missing_current_margin":
      return "Margem atual indisponível";
    case "missing_product_cost":
      return "Cadastre o custo em Meus produtos";
    case "impossible":
      return "Inatingível com os custos atuais";
    case "incomplete":
      return "Dados insuficientes";
    case "ok":
      return "";
  }
}

type ApplySuccess = {
  anchor: { netAmount: number } | null;
  tiers: Array<{ level: number; minPurchaseUnit: number; netAmount: number }>;
};

function WholesaleLevels({
  row,
  wholesaleReductions,
}: {
  row: FinancialEvaluationRow;
  wholesaleReductions: WholesaleReductionSettings;
}) {
  const [pendingLevels, setPendingLevels] = useState<Level[] | null>(null);
  const [applying, setApplying] = useState(false);
  const [applySuccess, setApplySuccess] = useState<ApplySuccess | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  const levels = useMemo(
    () =>
      computeWholesalePricesForListing({
        salePrice: row.salePrice,
        mlFeeAmount: row.mlFeeAmount,
        mlFeeRebate: row.mlFeeRebate,
        shippingCost: row.shippingCost,
        productCost: row.productCost,
        extraCosts: row.extraCosts,
        currentMarginPercent: row.breakdown?.marginPercent ?? null,
        currentMarginValue: row.breakdown?.marginValue ?? null,
        reductions: wholesaleReductionsToTuple(wholesaleReductions),
      }),
    [row, wholesaleReductions],
  );
  const applicableLevels = levels.filter(
    (level) => level.suggestedPrice !== null && level.reason === "ok",
  );
  const blockingReason =
    applicableLevels.length === 0 ? (levels[0]?.reason ?? "incomplete") : null;

  async function applyToMl(levelsToApply: Level[]) {
    setApplying(true);
    setApplyError(null);
    setApplySuccess(null);
    try {
      const res = await fetch(
        `/api/ml/items/${encodeURIComponent(row.mlItemId)}/wholesale-prices`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ levels: levelsToApply }),
        },
      );
      if (!res.ok) {
        setApplyError(await readApiError(res, "wholesale_apply_failed"));
        return;
      }
      const json = (await res.json()) as {
        anchor?: { netAmount: number };
        tiers?: ApplySuccess["tiers"];
      };
      setApplySuccess({
        anchor: json.anchor ? { netAmount: json.anchor.netAmount } : null,
        tiers: json.tiers ?? [],
      });
    } catch {
      setApplyError("Falha de rede ao aplicar preços no Mercado Livre.");
    } finally {
      setApplying(false);
      setPendingLevels(null);
    }
  }

  const pendingRows =
    pendingLevels?.map((level) => {
      const computed = levels[level - 1];
      const anchor = isWholesaleAnchorLevel(level);
      return {
        key: `level-${level}`,
        label: anchor ? "Nível 1 · âncora" : `Nível ${level}`,
        qtyLabel: anchor
          ? "1 un"
          : `${mlDiscountMinPurchaseUnitForLevel(level, wholesaleReductions)}+ un`,
        netAmount: computed?.suggestedPrice ?? null,
      };
    }) ?? [];

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--muted-foreground)]">
        Base: preço de hoje{" "}
        <span className="font-medium text-[var(--foreground)] tabular-nums">
          {formatFinancialMoney(row.salePrice)}
        </span>{" "}
        · margem{" "}
        <span className="font-medium text-[var(--foreground)] tabular-nums">
          {formatFinancialMoney(row.breakdown?.marginValue ?? null)}
        </span>{" "}
        ({formatFinancialPercent(row.breakdown?.marginPercent ?? null)}) por
        unidade.
      </p>

      {blockingReason && blockingReason !== "ok" ? (
        <UserFeedback tone="warning" title="Não dá para calcular o atacado">
          {levelReasonLabel(blockingReason)}.
        </UserFeedback>
      ) : null}

      {applySuccess ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <p className="flex items-center gap-1.5 font-medium">
            <CheckCircle2 className="size-4" aria-hidden />
            Preços de atacado aplicados no ML
          </p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {applySuccess.anchor ? (
              <li>
                Âncora (1 un):{" "}
                <span className="tabular-nums">
                  {formatFinancialMoney(applySuccess.anchor.netAmount)}
                </span>
              </li>
            ) : null}
            {applySuccess.tiers.map((tier) => (
              <li key={tier.level}>
                Nível {tier.level} · {tier.minPurchaseUnit}+ un ·{" "}
                <span className="font-semibold tabular-nums">
                  {formatFinancialMoney(tier.netAmount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {applyError ? <UserFeedback>{applyError}</UserFeedback> : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[28rem] text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted-foreground)]">
              <th className="py-2 pr-3 font-medium">Nível</th>
              <th className="py-2 pr-3 text-right font-medium">Quantidade</th>
              <th className="py-2 pr-3 text-right font-medium">Abre mão</th>
              <th className="py-2 pr-3 text-right font-medium">Margem/un.</th>
              <th className="py-2 pr-3 text-right font-medium">Preço</th>
              <th className="py-2 text-right font-medium">
                <span className="sr-only">Ação</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {levels.map((level) => {
              const canApply =
                level.suggestedPrice !== null && level.reason === "ok";
              const anchor = isWholesaleAnchorLevel(level.level);
              const minQty = displayMinPurchaseUnitForLevel(
                level.level,
                wholesaleReductions,
              );
              return (
                <tr
                  key={level.level}
                  className="border-b border-[var(--border)] last:border-b-0"
                >
                  <td className="py-2 pr-3 font-medium">
                    {level.level}
                    {anchor ? (
                      <span className="ml-1.5 rounded-full border border-[var(--border)] bg-[var(--muted)]/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                        Âncora
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {anchor ? `${minQty} un` : `${minQty}+ un`}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-[var(--muted-foreground)]">
                    −{formatFinancialPercent(level.reductionPercent)}
                  </td>
                  <td
                    className="py-2 pr-3 text-right tabular-nums"
                    title={
                      level.targetMarginPercent !== null
                        ? formatFinancialPercent(level.targetMarginPercent)
                        : undefined
                    }
                  >
                    {formatFinancialMoney(level.targetMarginValue)}
                  </td>
                  <td className="py-2 pr-3 text-right font-semibold tabular-nums">
                    {level.suggestedPrice !== null ? (
                      formatFinancialMoney(level.suggestedPrice)
                    ) : (
                      <span
                        className="font-normal text-[var(--muted-foreground)]"
                        title={levelReasonLabel(level.reason)}
                      >
                        —
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={applying || !canApply}
                      onClick={() => setPendingLevels([level.level as Level])}
                    >
                      Aplicar
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-[var(--muted-foreground)]">
          Nível 1 vai na âncora do ML (preço de 1 un.). Níveis 2 e 3 são
          descontos por quantidade.
        </p>
        <Button
          type="button"
          size="sm"
          disabled={applying || applicableLevels.length === 0}
          onClick={() => setPendingLevels([1, 2, 3])}
        >
          Aplicar os 3 níveis no ML
        </Button>
      </div>

      <AlertDialog
        open={pendingLevels !== null}
        onOpenChange={(next) => {
          if (!next && !applying) setPendingLevels(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aplicar no Mercado Livre</AlertDialogTitle>
            <AlertDialogDescription>
              Estes preços por quantidade serão enviados para{" "}
              <span className="font-medium text-[var(--foreground)]">
                {row.sku ? `SKU ${row.sku}` : row.mlItemId}
              </span>
              .
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="space-y-2 text-sm">
            {pendingRows.map((item) => (
              <li
                key={item.key}
                className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] px-3 py-2"
              >
                <span>
                  {item.label} · {item.qtyLabel}
                </span>
                <span className="font-semibold tabular-nums">
                  {formatFinancialMoney(item.netAmount)}
                </span>
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={applying}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={applying || !pendingLevels}
              onClick={(event) => {
                // mantém aberto até o ML responder
                event.preventDefault();
                if (pendingLevels) void applyToMl(pendingLevels);
              }}
            >
              {applying ? "Aplicando…" : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * Atacado B2B: preço menor pra quem compra mais unidades, publicado nas
 * faixas de quantidade do Mercado Livre. Calculado sempre no preço de HOJE
 * (linha ao vivo) — a mesma base que a rota de aplicar usa.
 */
export function WholesaleTab({
  live,
  wholesaleReductions,
  onSaveWholesaleReductions,
}: {
  live: LiveListingRowState;
  wholesaleReductions: WholesaleReductionSettings;
  onSaveWholesaleReductions: (values: WholesaleReductionSettings) => Promise<void>;
}) {
  return (
    <div className="space-y-4">
      <section className="flex items-start gap-3 rounded-lg border border-[var(--primary)]/25 bg-[var(--primary)]/5 p-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
          <Layers2 className="size-4" aria-hidden />
        </span>
        <p className="text-sm leading-relaxed">
          Ofereça um preço menor para quem compra mais unidades. Cada nível
          abre mão de uma parte da sua margem em R$ — taxa, frete e custo
          continuam cobertos.
        </p>
      </section>

      {live.status === "loading" ? (
        <div className="space-y-2" aria-label="Consultando o preço de hoje no ML">
          <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--muted)]" />
          <div className="h-28 w-full animate-pulse rounded-lg bg-[var(--muted)]" />
        </div>
      ) : live.status === "not_operational" ? (
        <UserFeedback tone="info" title="Anúncio fora do ar">
          O anúncio não está ativo nem pausado no Mercado Livre, então não dá
          para publicar preços de atacado.
        </UserFeedback>
      ) : live.status === "error" ? (
        <UserFeedback>{live.message}</UserFeedback>
      ) : (
        <WholesaleLevels row={live.row} wholesaleReductions={wholesaleReductions} />
      )}

      <WholesaleReductionSettingsCard
        values={wholesaleReductions}
        onSave={onSaveWholesaleReductions}
      />
    </div>
  );
}
