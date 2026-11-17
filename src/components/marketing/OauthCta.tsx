"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { OauthCtaIcon } from "@/components/marketing/OauthCtaIcon";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics/track";
import { cn } from "@/lib/utils";

/**
 * Quem não está logado passa antes pela `/conectar`, que avisa que o Mercado
 * Livre vai mostrar "aplicativo não certificado" e só então segue para o OAuth.
 * Para voltar ao fluxo direto, apontar para `/api/auth/mercadolibre/signin`.
 */
export const CONNECT_PATH = "/conectar";

export function OAuthCta({
  isLoggedIn,
  dashboardHref,
  size = "lg",
  onDark = false,
  className,
  tabIndex,
  location = "other",
  label = "Testar grátis",
  connectHref = CONNECT_PATH,
}: {
  isLoggedIn: boolean;
  dashboardHref: string;
  size?: "sm" | "lg";
  onDark?: boolean;
  className?: string;
  /** -1 quando o CTA está visualmente escondido (barra fixa fora de tela). */
  tabIndex?: number;
  /** Posição do botão na página, vai no evento `cta_click` (hero, sticky…). */
  location?: string;
  label?: string;
  /** A `/beta` passa a `/conectar` com a oferta na query. */
  connectHref?: string;
}) {
  const shape =
    size === "sm"
      ? "h-9 rounded-full px-4 text-sm font-semibold"
      : "h-12 rounded-full px-7 text-[15px] font-semibold";

  const appearance = onDark
    ? "border-0 bg-white text-[#0f1a45] shadow-[0_10px_30px_-12px_rgba(0,0,0,0.45)] hover:bg-white/90"
    : "border-0 bg-[#1b2d6f] text-white shadow-none hover:bg-[#152456]";

  return (
    <Button
      size={size}
      asChild
      className={cn(shape, appearance, "whitespace-nowrap", className)}
    >
      {isLoggedIn ? (
        // Com o token vencendo, o href é a rota de refresh, um GET que troca
        // tokens e grava cookies. O prefetch automático do `<Link>` a executaria
        // só de o botão aparecer na tela, e um refresh que falhasse ali apagaria
        // a sessão de quem nem clicou.
        <Link
          href={dashboardHref}
          tabIndex={tabIndex}
          prefetch={dashboardHref.startsWith("/api/") ? false : undefined}
        >
          Ir para o dashboard
          <OauthCtaIcon />
        </Link>
      ) : (
        <Link
          href={connectHref}
          tabIndex={tabIndex}
          onClick={() =>
            track("cta_click", {
              cta_location: location,
              page: window.location.pathname,
            })
          }
        >
          {label}
          <ArrowRight />
        </Link>
      )}
    </Button>
  );
}
