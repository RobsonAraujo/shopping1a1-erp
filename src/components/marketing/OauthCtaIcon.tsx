"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import { useLinkStatus } from "next/link";

/**
 * Seta do CTA que vira spinner assim que o clique acontece. Componente client à
 * parte porque `useLinkStatus` precisa estar dentro do `<Link>`, e o `OAuthCta`
 * é renderizado no servidor pelas páginas de marketing.
 */
export function OauthCtaIcon() {
  const { pending } = useLinkStatus();
  return pending ? (
    <Loader2 className="animate-spin" aria-hidden />
  ) : (
    <ArrowRight aria-hidden />
  );
}
