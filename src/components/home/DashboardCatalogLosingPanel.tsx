import {
  HOME_WIDGET_LIST_CAP,
  HomeWidgetCard,
  HomeWidgetEmpty,
  HomeWidgetList,
  HomeWidgetListRow,
} from "@/components/home/dashboard/HomeWidgetCard";
import { formatFinancialMoney } from "@/lib/pricing/financial-margin";
import { sellerListingModifyUrl } from "@/lib/mercadolibre/seller-listing-url";
import type { CatalogLosingRow } from "@/lib/home/catalog-losing-data";

/**
 * Card vazio **não desaparece**: mostra o "tudo ok". Esconder fazia o usuário
 * achar que o monitoramento não existia.
 */
export function DashboardCatalogLosingPanel({
  rows,
}: {
  rows: CatalogLosingRow[];
}) {
  if (rows.length === 0) {
    return (
      <HomeWidgetCard definitionId="catalogo-perdendo">
        <HomeWidgetEmpty
          tone="ok"
          title="Nenhum anúncio perdendo o catálogo"
          description="Todos os seus anúncios de catálogo estão com a compra."
        />
      </HomeWidgetCard>
    );
  }

  return (
    <HomeWidgetCard definitionId="catalogo-perdendo" count={rows.length}>
      <HomeWidgetList
        hiddenCount={Math.max(0, rows.length - HOME_WIDGET_LIST_CAP)}
        moreHref="/dashboard/catalog-report"
      >
        {rows.slice(0, HOME_WIDGET_LIST_CAP).map((row) => (
          <HomeWidgetListRow
            key={row.mlItemId}
            href={sellerListingModifyUrl(row.mlItemId)}
            imageUrl={row.imageUrl}
            title={row.sku}
            subtitle={`${formatFinancialMoney(row.sellerPrice)} · ganhar ${formatFinancialMoney(row.priceToWin)}`}
            trailing={row.gap != null ? formatFinancialMoney(row.gap) : "Perdendo"}
            trailingClassName="text-rose-700"
            hint={`${row.title} · editar no Mercado Livre`}
          />
        ))}
      </HomeWidgetList>
    </HomeWidgetCard>
  );
}
