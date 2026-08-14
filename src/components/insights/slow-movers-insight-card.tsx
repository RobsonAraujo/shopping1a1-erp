"use client";

import { TrendingDown } from "lucide-react";
import { InsightExpandableCard } from "@/components/insights/insight-expandable-card";
import { SlowMoversCard } from "@/components/insights/slow-movers-card";
import { filterSlowMoverRows } from "@/lib/insights/slow-movers";
import { useSlowMoverThreshold } from "@/hooks/use-slow-mover-threshold";
import type { SlowMoverRow } from "@/lib/insights/types";

function plural(n: number, singular: string, plural_: string) {
  return `${n} ${n === 1 ? singular : plural_}`;
}

export function SlowMoversInsightCard({ allRows }: { allRows: SlowMoverRow[] }) {
  const [threshold] = useSlowMoverThreshold();
  const slowCount = filterSlowMoverRows(allRows, threshold).length;

  return (
    <InsightExpandableCard
      title="Rotação baixa"
      subtitle={`Produtos com cobertura acima de ${threshold} dias ou sem vendas no período`}
      icon={<TrendingDown className="size-4" aria-hidden />}
      iconClassName="bg-orange-100 text-orange-700"
      accentClassName="border-l-orange-400"
      badge={slowCount > 0 ? plural(slowCount, "produto", "produtos") : "tudo ok"}
      badgeVariant={slowCount > 0 ? "warning" : "success"}
    >
      <SlowMoversCard allRows={allRows} />
    </InsightExpandableCard>
  );
}
