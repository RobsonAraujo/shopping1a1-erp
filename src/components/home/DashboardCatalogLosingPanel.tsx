"use client";

import { useState } from "react";
import {
  HOME_WIDGET_LIST_CAP,
  HomeWidgetCard,
  HomeWidgetEmpty,
  HomeWidgetList,
  HomeWidgetListRow,
} from "@/components/home/dashboard/HomeWidgetCard";
import { useWidgetFetch } from "@/hooks/use-widget-fetch";
import { clearWidgetFetch } from "@/lib/home/dashboard/widget-fetch-cache";
import { UserFeedback } from "@/components/ui/user-feedback";
import { formatApiErrorMessage, readApiError } from "@/lib/api/api-client-error";
import { formatFinancialMoney } from "@/lib/pricing/financial-margin";
import { sellerListingModifyUrl } from "@/lib/mercadolibre/seller-listing-url";
import type {
  CatalogLosingResult,
  CatalogLosingRow,
} from "@/lib/home/catalog-losing-data";

const ENDPOINT = "/api/dashboard/widgets/catalog-losing";

async function loadAll(): Promise<CatalogLosingResult> {
  const res = await fetch(ENDPOINT, { cache: "no-store" });
  // Checa `ok` antes de ler o corpo: resposta de erro não-JSON faria o
  // `res.json()` estourar e a mensagem crua do parser aparecer no card.
  if (!res.ok) {
    throw new Error(
      formatApiErrorMessage(await readApiError(res, "catalog_losing_failed")),
    );
  }
  return (await res.json()) as CatalogLosingResult;
}

/**
 * Catálogo perdendo.
 *
 * O snapshot de servidor traz só as **5 piores** linhas (maior diferença até o
 * preço de ganhar) mais o total — antes vinha toda linha perdendo pra mostrar
 * cinco e contar o resto, o que custava egress e payload de RSC proporcionais ao
 * catálogo em **toda** abertura da Home.
 *
 * "Ver todos" busca o resto numa rota própria. Duas coisas de propósito:
 *
 * - O estado expandido é **efêmero** (estado de componente, nunca preferência).
 *   Persistir traria a lista grande de volta em todo carregamento e desfaria a
 *   economia.
 * - A busca passa por `useWidgetFetch`, então ela sobrevive à remontagem de
 *   arrastar o card entre colunas e não repete request se clicar duas vezes.
 *
 * Card vazio **não desaparece**: mostra o "tudo ok". Esconder fazia o usuário
 * achar que o monitoramento não existia.
 */
export function DashboardCatalogLosingPanel({
  preview,
  total,
}: {
  preview: CatalogLosingRow[];
  total: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const entry = useWidgetFetch<CatalogLosingResult>(ENDPOINT, loadAll, expanded);

  if (total === 0) {
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

  const loaded = expanded && entry.status === "ok" ? entry.value.rows : null;
  const rows = loaded ?? preview;
  const pending = expanded && entry.status === "loading";
  const failed = expanded && entry.status === "error";
  // Com a lista aberta, o que ainda sobra está acima do teto da rota: aí o
  // caminho honesto é o relatório, não um segundo clique que não traria nada.
  const hiddenCount = Math.max(0, total - rows.length);

  return (
    <HomeWidgetCard definitionId="catalogo-perdendo" count={total}>
      {/* Falha ao expandir vira aviso ao LADO da lista, não no lugar dela: o
          `error` do card substitui o corpo, e aí quem clicou pra ver mais ficava
          vendo menos. A prévia continua servindo e o botão tenta de novo —
          `clearWidgetFetch` invalida a chave e o hook rebusca. */}
      {failed ? (
        <div className="mb-3">
          <UserFeedback tone="warning">
            Não foi possível carregar a lista completa. {entry.status === "error" ? entry.error : ""}
          </UserFeedback>
        </div>
      ) : null}

      <HomeWidgetList
        hiddenCount={hiddenCount}
        moreTotal={total}
        scroll={loaded !== null}
        moreHref={loaded ? "/dashboard/catalog-report" : undefined}
        onMore={
          loaded
            ? undefined
            : failed
              ? () => clearWidgetFetch(ENDPOINT)
              : () => setExpanded(true)
        }
        morePending={pending}
      >
        {rows.slice(0, loaded ? rows.length : HOME_WIDGET_LIST_CAP).map((row) => (
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
