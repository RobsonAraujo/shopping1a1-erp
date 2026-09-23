import { siteUrl } from "@/lib/infra/site-url";
import { LEGAL } from "@/lib/marketing/legal";

/**
 * JSON-LD da home. Sem `aggregateRating`: não temos avaliações reais, e
 * marcação inventada é penalizada pelo Google além de ser desonesta.
 */
export function softwareApplicationStructuredData() {
  const base = siteUrl();

  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: LEGAL.productName,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "ERP",
    operatingSystem: "Web",
    url: base,
    inLanguage: "pt-BR",
    description:
      "Painel de lucratividade, apuração tributária e DRE para vendedores do Mercado Livre. Margem por anúncio depois do Product Ads, apuração de Lucro Real e Simples Nacional por SKU, kanban de compras e Full.",
    featureList: [
      "Margem de contribuição e margem pós ADS por anúncio",
      "Apuração de Lucro Real por SKU (PIS/COFINS, ICMS, DIFAL)",
      "Simples Nacional: RBT12, faixa do Anexo I e composição do DAS",
      "DRE mensal reconciliado com a fatura do Mercado Livre",
      "Kanban de compras e Operações Full",
      "Concorrência de catálogo e buybox",
    ],
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "BRL",
      description: "Gratuito durante o beta, sem cartão de crédito.",
      url: `${base}/precos`,
    },
  };
}

export function organizationStructuredData() {
  const base = siteUrl();

  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: LEGAL.productName,
    url: base,
    logo: `${base}/logo-bg-blue.png`,
    email: LEGAL.supportEmail,
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: LEGAL.supportEmail,
        availableLanguage: ["pt-BR"],
      },
    ],
  };
}
