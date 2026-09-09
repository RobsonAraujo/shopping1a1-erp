import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/infra/site-url";

/** Só `/` é pública — o resto do app fica atrás de login ML (ver robots.ts). */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl(),
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
