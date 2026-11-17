"use client";

import { useEffect } from "react";
import {
  ATTRIBUTION_COOKIE,
  ATTRIBUTION_MAX_AGE_S,
  attributionFromSearch,
  serializeAttribution,
} from "@/lib/marketing/attribution";

/**
 * Guarda UTM e id de clique do Google num cookie first-party na primeira carga
 * da página. O clique do anúncio é sempre uma carga completa, então basta o
 * mount do root layout. O callback do OAuth lê o cookie ao criar a conta.
 */
export function AttributionCapture() {
  useEffect(() => {
    try {
      const attribution = attributionFromSearch(
        window.location.search,
        window.location.pathname,
      );
      if (!attribution) return;
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${ATTRIBUTION_COOKIE}=${serializeAttribution(attribution)}; Max-Age=${ATTRIBUTION_MAX_AGE_S}; Path=/; SameSite=Lax${secure}`;
    } catch {
      // Cookie bloqueado pelo navegador: a medição pelo GTM continua.
    }
  }, []);

  return null;
}
