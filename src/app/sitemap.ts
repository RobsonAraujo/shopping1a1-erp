import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/infra/site-url";

/** Páginas públicas de marketing — o resto do app fica atrás de login ML (ver robots.ts). */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return [
    {
      url: base,
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: `${base}/precos`,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${base}/dre-mercado-livre`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${base}/margem-de-contribuicao-mercado-livre`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${base}/lucro-real-mercado-livre`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${base}/simples-nacional-mercado-livre`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${base}/kanban-compras-mercado-livre`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
  ];
}
