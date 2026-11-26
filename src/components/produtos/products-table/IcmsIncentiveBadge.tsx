"use client";

import { Badge } from "@/components/ui/badge";
import { formatFinancialPercent } from "@/lib/pricing/financial-margin";
import type { ProductView } from "@/lib/products/product-data";
import { normalizeNcm } from "@/lib/tax-incentives/ncm";
import type { IcmsIncentiveRule } from "@/lib/tax-incentives/types";

/** Selo "Incentivo 12%" do NCM do produto (some se o produto é "não se aplica"). */
export function IcmsIncentiveBadge({
  product,
  incentiveByNcm,
}: {
  product: Pick<ProductView, "ncm" | "icmsIncentiveExcluded">;
  incentiveByNcm?: ReadonlyMap<string, IcmsIncentiveRule>;
}) {
  const ncm = normalizeNcm(product.ncm);
  const rule = ncm ? incentiveByNcm?.get(ncm) : undefined;
  if (!rule || product.icmsIncentiveExcluded) return null;
  return (
    <Badge
      variant="secondary"
      className="text-[10px]"
      title={`Incentivo fiscal de ICMS do NCM: ${formatFinancialPercent(rule.ratePercent)} nas vendas internas${rule.appliesTo === "contribuinte" ? " (só contribuinte)" : ""}`}
    >
      Incentivo {formatFinancialPercent(rule.ratePercent)}
    </Badge>
  );
}
