import type { ItemBody } from "@/lib/mercadolibre/types";

/**
 * `date_created` em `/items/{id}` é a criação deste anúncio na conta do vendedor
 * (seller_id), não a data do produto no catálogo geral do ML (`/products`).
 */
export function formatSellerListingStartedLabel(
  item: Pick<ItemBody, "date_created" | "catalog_listing">,
): { label: string; hint: string } | null {
  if (!item.date_created) return null;

  const date = new Date(item.date_created);
  if (Number.isNaN(date.getTime())) return null;

  const formatted = date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const daysAgo = Math.max(
    0,
    Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000)),
  );
  const relativeLabel =
    daysAgo === 0
      ? "hoje"
      : daysAgo === 1
        ? "1 dia atrás"
        : `${daysAgo} dias atrás`;

  const isCatalog = item.catalog_listing === true;
  const prefix = isCatalog
    ? "Você entrou no catálogo em"
    : "Anúncio criado em";
  const hint = isCatalog
    ? "Data em que este anúncio de catálogo foi criado na sua loja (API /items). Não é a ficha geral do produto no Mercado Livre."
    : "Data em que você criou este anúncio na sua loja (API /items).";

  return {
    label: `${prefix} ${formatted} (${relativeLabel})`,
    hint,
  };
}
