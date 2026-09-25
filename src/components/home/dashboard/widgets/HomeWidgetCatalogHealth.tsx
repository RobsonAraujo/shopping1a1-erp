"use client";

import Link from "next/link";
import {
  HomeWidgetCard,
  HomeWidgetEmpty,
  HomeWidgetMetric,
} from "@/components/home/dashboard/HomeWidgetCard";
import { useHomeCore } from "@/components/home/dashboard/HomeDashboardProvider";
import { getHomeWidgetDefinition } from "@/lib/home/dashboard/widget-registry";

const DEFINITION = getHomeWidgetDefinition("produtos-saude");

/** Quantos produtos existem, quantos anúncios estão ativos e quantos custos
 * pedem revisão — o "está tudo cadastrado?" num olhar. */
export function HomeWidgetCatalogHealth() {
  const { catalog } = useHomeCore();
  if (!DEFINITION) return null;

  if (!catalog) {
    return (
      <HomeWidgetCard
        definition={DEFINITION}
        error="Não foi possível carregar o catálogo agora."
      />
    );
  }

  if (catalog.productCount === 0) {
    return (
      <HomeWidgetCard definition={DEFINITION}>
        <HomeWidgetEmpty
          title="Nenhum produto cadastrado"
          description="Cadastre custo, ICMS e NCM por SKU — é a base da margem e do DRE."
          actionLabel="Cadastrar produtos"
          actionHref="/dashboard/produtos"
        />
      </HomeWidgetCard>
    );
  }

  const needsReview = catalog.needsCostReviewCount;

  return (
    <HomeWidgetCard definition={DEFINITION}>
      <HomeWidgetMetric
        value={catalog.productCount.toLocaleString("pt-BR")}
        label={
          catalog.productCount === 1
            ? "produto cadastrado"
            : "produtos cadastrados"
        }
        hint={`${catalog.activeListingCount.toLocaleString("pt-BR")} ${
          catalog.activeListingCount === 1 ? "anúncio ativo" : "anúncios ativos"
        }`}
      />
      <div className="mt-3 border-t border-[var(--border)] pt-3">
        {needsReview > 0 ? (
          <Link
            href="/dashboard/produtos"
            className="text-sm text-amber-800 underline-offset-4 hover:underline"
          >
            {needsReview.toLocaleString("pt-BR")}{" "}
            {needsReview === 1
              ? "produto com custo a revisar"
              : "produtos com custo a revisar"}
          </Link>
        ) : (
          <p className="text-sm text-[var(--muted-foreground)]">
            Todos os custos estão revisados.
          </p>
        )}
      </div>
    </HomeWidgetCard>
  );
}
