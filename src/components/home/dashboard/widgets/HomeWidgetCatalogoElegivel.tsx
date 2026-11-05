"use client";

import {
  HomeWidgetCard,
  HomeWidgetEmpty,
  HomeWidgetExpandableList,
  HomeWidgetListRow,
} from "@/components/home/dashboard/HomeWidgetCard";
import { CATALOG_ELIGIBLE_ENDPOINT } from "@/config/dashboard-summary";
import { useInView } from "@/hooks/use-in-view";
import { useWidgetFetch } from "@/hooks/use-widget-fetch";
import { formatApiErrorMessage, readApiError } from "@/lib/api/api-client-error";
import type {
  CatalogEligiblePayload,
  CatalogEligibleRow,
} from "@/lib/home/catalog-eligible-data";
import { formatFinancialMoney } from "@/lib/pricing/financial-margin";

async function loadCatalogEligible(): Promise<CatalogEligiblePayload> {
  const res = await fetch(CATALOG_ELIGIBLE_ENDPOINT, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(
      formatApiErrorMessage(await readApiError(res, "catalog_eligible_failed")),
    );
  }
  return (await res.json()) as CatalogEligiblePayload;
}

function EligibleRow({ row }: { row: CatalogEligibleRow }) {
  return (
    <HomeWidgetListRow
      href={row.permalink}
      imageUrl={row.imageUrl}
      title={row.sku ?? "Sem SKU"}
      subtitle={`${row.soldQuantity.toLocaleString("pt-BR")} vendidos`}
      trailing={formatFinancialMoney(row.price)}
      hint={`${row.title} · abrir no Mercado Livre`}
    />
  );
}

/**
 * Anúncios próprios que o Mercado Livre marcou como elegíveis para virar catálogo.
 * Só avisa: aderir ao catálogo continua sendo feito no Mercado Livre.
 *
 * Como nos outros cards de alerta, a seção nunca desaparece: sem nada a avisar
 * vira "tudo ok", e falha vira o erro dentro do próprio card.
 */
export function HomeWidgetCatalogoElegivel() {
  const [setRef, inView] = useInView<HTMLDivElement>();
  const entry = useWidgetFetch<CatalogEligiblePayload>(
    CATALOG_ELIGIBLE_ENDPOINT,
    loadCatalogEligible,
    inView,
  );

  const data = entry.status === "ok" ? entry.value : null;
  // `?? []`: a Home não tem error boundary por widget, e um campo faltando na
  // resposta não pode derrubar a página.
  const rows = data?.rows ?? [];
  const total = data?.total ?? rows.length;

  return (
    <div ref={setRef}>
      <HomeWidgetCard
        definitionId="catalogo-elegivel"
        pending={entry.status === "loading"}
        error={entry.status === "error" ? entry.error : null}
        count={total}
      >
        {rows.length > 0 ? (
          <HomeWidgetExpandableList
            rows={rows}
            total={total}
            renderRow={(row) => <EligibleRow key={row.mlItemId} row={row} />}
          />
        ) : (
          <HomeWidgetEmpty
            tone="ok"
            title="Nenhum anúncio elegível"
            description="Nenhum anúncio próprio está marcado para virar catálogo."
          />
        )}
      </HomeWidgetCard>
    </div>
  );
}
