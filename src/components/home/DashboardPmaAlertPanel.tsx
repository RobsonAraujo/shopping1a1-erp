import {
  HOME_WIDGET_LIST_CAP,
  HomeWidgetList,
  HomeWidgetListRow,
} from "@/components/home/dashboard/HomeWidgetCard";
import { formatFinancialMoney } from "@/lib/pricing/financial-margin";
import { sellerListingModifyUrl } from "@/lib/mercadolibre/seller-listing-url";
import type { PmaAlertRow } from "@/lib/home/pma-alert-data";

/** Só o corpo da lista — o cabeçalho, o contador e o estado vazio são do
 * `HomeWidgetCard` de quem renderiza. */
export function DashboardPmaAlertPanel({ rows }: { rows: PmaAlertRow[] }) {
  return (
    <HomeWidgetList hiddenCount={Math.max(0, rows.length - HOME_WIDGET_LIST_CAP)}>
      {rows.slice(0, HOME_WIDGET_LIST_CAP).map((row) => (
        <HomeWidgetListRow
          key={row.mlItemId}
          href={sellerListingModifyUrl(row.mlItemId)}
          imageUrl={row.imageUrl}
          title={row.sku}
          subtitle={`${formatFinancialMoney(row.currentPrice)} · PMA ${formatFinancialMoney(row.pmaPrice)}`}
          trailing={`-${row.shortfallPercent.toLocaleString("pt-BR", {
            maximumFractionDigits: 1,
          })}%`}
          trailingClassName="text-rose-700"
          hint={`${row.title} · editar no Mercado Livre`}
        />
      ))}
    </HomeWidgetList>
  );
}
