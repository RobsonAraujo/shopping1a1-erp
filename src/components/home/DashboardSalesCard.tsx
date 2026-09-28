import {
  HomeWidgetCard,
  HomeWidgetMeter,
  HomeWidgetMetric,
} from "@/components/home/dashboard/HomeWidgetCard";
import type { DashboardSalesSnapshot } from "@/lib/home/sales-card-data";

const POSITIVE_RATINGS_LABEL = "Avaliações positivas";
const POSITIVE_RATINGS_HINT =
  "Dos compradores que avaliaram a compra no Mercado Livre";

/**
 * Renderizado no **servidor** (vai pra grade como o nó `sellerCard`, dentro de
 * um `<Suspense>`, pra o `fetchMe` streamar em vez de travar o TTFB). Por isso
 * passa `definitionId` e não a definição: esta carrega `icon`, que é função, e
 * função não atravessa a fronteira server → client.
 */
export function DashboardSalesCard({
  snapshot,
  pending = false,
}: {
  snapshot?: DashboardSalesSnapshot | null;
  pending?: boolean;
}) {
  const fillPercent = snapshot?.satisfactionPercent ?? null;

  return (
    <HomeWidgetCard definitionId="kpi-vendas" pending={pending}>
      <HomeWidgetMetric
        value={snapshot ? snapshot.completed.toLocaleString("pt-BR") : "—"}
        label="vendas concluídas no Mercado Livre"
      />
      <HomeWidgetMeter
        label={POSITIVE_RATINGS_LABEL}
        value={fillPercent != null ? `${fillPercent}%` : undefined}
        percent={fillPercent}
        fillClassName="bg-emerald-500"
        valueClassName="text-emerald-700"
        hint={POSITIVE_RATINGS_HINT}
      />
    </HomeWidgetCard>
  );
}
