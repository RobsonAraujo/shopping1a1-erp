"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics/track";
import { AUTH_EVENT_COOKIE, parseAuthEvent } from "@/lib/marketing/attribution";

function readCookie(name: string): string | undefined {
  const prefix = `${name}=`;
  return document.cookie
    .split("; ")
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
}

/**
 * Dispara `sign_up` (conta nova, a conversão do Google Ads) ou `login` uma
 * única vez depois do callback do OAuth, que deixa o sinal no cookie
 * `maipo_auth_evt`. O cookie é apagado antes do push para não contar de novo
 * num reload.
 */
export function AuthEventBeacon() {
  useEffect(() => {
    let raw: string | undefined;
    try {
      raw = readCookie(AUTH_EVENT_COOKIE);
      if (!raw) return;
      document.cookie = `${AUTH_EVENT_COOKIE}=; Max-Age=0; Path=/`;
    } catch {
      return;
    }
    const authEvent = parseAuthEvent(raw);
    if (!authEvent) return;
    track(authEvent.event, {
      method: "mercadolivre",
      offer: authEvent.offer,
    });
  }, []);

  return null;
}
