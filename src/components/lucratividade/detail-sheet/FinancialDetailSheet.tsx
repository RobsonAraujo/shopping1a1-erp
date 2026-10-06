"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { ExternalLink, Layers2, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  SegmentedTabs,
  tabId,
  tabPanelId,
} from "@/components/ui/segmented-tabs";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ListingStatusBadge } from "@/components/shared/ListingStatusBadge";
import type { FinancialEvaluationRow } from "@/lib/lucratividade/financial-evaluation-data";
import type { LucratividadeTaxContext } from "@/lib/lucratividade/row-issues";
import {
  formatFinancialMoney,
  type MarginBasis,
} from "@/lib/pricing/financial-margin";
import type { WholesaleReductionSettings } from "@/lib/pricing/wholesale-pricing";
import { MarginTab } from "@/components/lucratividade/detail-sheet/MarginTab";
import { WholesaleTab } from "@/components/lucratividade/detail-sheet/WholesaleTab";
import { ExclusionBadge } from "@/components/lucratividade/financial-evaluation-table/shared";
import { useLiveListingRow } from "@/components/lucratividade/hooks/useLiveListingRow";

type DetailTab = "margin" | "wholesale";

/** Atacado B2B pausado enquanto passa por ajustes — `true` reativa a aba
 * (o conteúdo continua em `WholesaleTab`). */
const WHOLESALE_TAB_ENABLED = false;

export function FinancialDetailSheet({
  row,
  isSimulation,
  periodLabel,
  targetMarginPercent,
  marginBasis,
  taxContext,
  wholesaleReductions,
  onSaveWholesaleReductions,
  onClose,
}: {
  row: FinancialEvaluationRow;
  isSimulation: boolean;
  periodLabel: string | null;
  targetMarginPercent: number;
  marginBasis: MarginBasis;
  taxContext: LucratividadeTaxContext;
  wholesaleReductions: WholesaleReductionSettings;
  onSaveWholesaleReductions: (values: WholesaleReductionSettings) => Promise<void>;
  onClose: () => void;
}) {
  const baseId = useId();
  const [tab, setTab] = useState<DetailTab>("margin");
  // Atacado monta na 1ª visita e depois só esconde — preserva o resultado de
  // "aplicar" ao alternar entre as abas.
  const [wholesaleMounted, setWholesaleMounted] = useState(false);
  const live = useLiveListingRow(row.mlItemId, targetMarginPercent, marginBasis);

  const contextLine = isSimulation
    ? row.hasPromotion && row.regularPrice != null
      ? `Preço de hoje ${formatFinancialMoney(row.salePrice)} (promoção, de ${formatFinancialMoney(row.regularPrice)})`
      : `Preço de hoje ${formatFinancialMoney(row.salePrice)}`
    : [
        periodLabel,
        `${(row.periodUnitsSold ?? 0).toLocaleString("pt-BR")} un.`,
        `${formatFinancialMoney(row.periodRevenue ?? null)} faturados`,
        `preço médio ${formatFinancialMoney(row.salePrice)}`,
      ]
        .filter(Boolean)
        .join(" · ");

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent className="sm:max-w-2xl">
        <SheetHeader>
          <div className="flex flex-wrap items-start justify-between gap-3 pr-6">
            <div className="min-w-0">
              <SheetTitle className="truncate text-lg text-[var(--primary)]">
                {row.sku ?? row.title}
              </SheetTitle>
              <p className="mt-0.5 truncate text-sm text-[var(--muted-foreground)]">
                {row.mlItemId}
                {row.listingTypeLabel ? ` · ${row.listingTypeLabel}` : ""}
                {row.sku ? ` · ${row.title}` : ""}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <ListingStatusBadge status={row.status} mlStock={0} warehouseStock={0} />
                <ExclusionBadge row={row} />
              </div>
              <p className="mt-1.5 text-xs tabular-nums text-[var(--muted-foreground)]">
                {contextLine}
              </p>
            </div>
            <Link
              href={row.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-[var(--primary)] hover:underline"
            >
              Ver no ML
              <ExternalLink className="size-3.5" aria-hidden />
            </Link>
          </div>
          <SegmentedTabs
            className="mt-3 w-full"
            baseId={baseId}
            ariaLabel="Detalhes do anúncio"
            value={tab}
            onValueChange={(next) => {
              setTab(next);
              if (next === "wholesale") setWholesaleMounted(true);
            }}
            tabs={[
              { id: "margin", label: "Margem", icon: TrendingUp },
              {
                id: "wholesale",
                label: "Atacado B2B",
                icon: Layers2,
                disabled: !WHOLESALE_TAB_ENABLED,
                badge: WHOLESALE_TAB_ENABLED ? undefined : "Em breve",
                disabledHint:
                  "O Atacado B2B está passando por ajustes e volta a ficar disponível em breve.",
              },
            ]}
          />
        </SheetHeader>
        <SheetBody>
          <div
            role="tabpanel"
            id={tabPanelId(baseId, "margin")}
            aria-labelledby={tabId(baseId, "margin")}
            hidden={tab !== "margin"}
          >
            <MarginTab
              row={row}
              live={live}
              isSimulation={isSimulation}
              periodLabel={periodLabel}
              targetMarginPercent={targetMarginPercent}
              marginBasis={marginBasis}
              taxContext={taxContext}
            />
          </div>
          {wholesaleMounted ? (
            <div
              role="tabpanel"
              id={tabPanelId(baseId, "wholesale")}
              aria-labelledby={tabId(baseId, "wholesale")}
              hidden={tab !== "wholesale"}
            >
              <WholesaleTab
                live={live}
                wholesaleReductions={wholesaleReductions}
                onSaveWholesaleReductions={onSaveWholesaleReductions}
              />
            </div>
          ) : null}
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
