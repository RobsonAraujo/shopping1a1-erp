"use client";

import { useEffect, useState } from "react";
import { OAuthCta } from "@/components/marketing/OauthCta";
import { cn } from "@/lib/utils";

/** Só aparece depois que o hero (e o CTA dele) saiu da tela. */
const REVEAL_AFTER_PX = 720;

export function MarketingStickyCta({
  isLoggedIn,
  dashboardHref,
}: {
  isLoggedIn: boolean;
  dashboardHref: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const sync = () => {
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      const nearBottom =
        window.innerHeight + y >= document.documentElement.scrollHeight - 720;
      setVisible(y > REVEAL_AFTER_PX && !nearBottom);
    };

    sync();
    window.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    return () => {
      window.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, []);

  return (
    <div
      className={cn(
        "marketing-sticky-cta fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-white/95 px-4 py-3 backdrop-blur-md lg:hidden",
        "pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]",
        visible
          ? "pointer-events-auto translate-y-0 opacity-100"
          : "pointer-events-none translate-y-full opacity-0",
      )}
      aria-hidden={!visible}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--foreground)]">
            {isLoggedIn ? "Seu painel está pronto" : "Grátis durante o beta"}
          </p>
          <p className="truncate text-xs text-[var(--muted-foreground)]">
            {isLoggedIn
              ? "Continue de onde parou"
              : "Sem cartão · sem senha nova"}
          </p>
        </div>
        <OAuthCta
          isLoggedIn={isLoggedIn}
          dashboardHref={dashboardHref}
          size="sm"
          className="shrink-0"
          tabIndex={visible ? undefined : -1}
        />
      </div>
    </div>
  );
}
