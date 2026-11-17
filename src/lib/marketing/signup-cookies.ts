import type {
  MlCookieReader,
  MlCookieStore,
} from "@/lib/mercadolibre/session";
import {
  ATTRIBUTION_COOKIE,
  AUTH_EVENT_COOKIE,
  LEAD_COOKIE,
  OFFER_COOKIE,
  parseAttribution,
  serializeAuthEvent,
  type AuthEvent,
  type SignupAttribution,
} from "@/lib/marketing/attribution";

const isProd = process.env.NODE_ENV === "production";

/** Ida e volta do OAuth cabe folgado em 1 dia (inclui quem volta depois do aviso do ML). */
const SIGNUP_COOKIE_MAX_AGE_S = 86_400;
/** O beacon roda na primeira carga do dashboard; 5 min cobre redirect lento. */
const AUTH_EVENT_MAX_AGE_S = 300;

function httpOnlyCookie(maxAge: number) {
  return {
    httpOnly: true as const,
    secure: isProd,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function setOfferCookie(store: MlCookieStore, offerId: string) {
  store.set(OFFER_COOKIE, offerId, httpOnlyCookie(SIGNUP_COOKIE_MAX_AGE_S));
}

export function setLeadCookie(store: MlCookieStore, leadId: string) {
  store.set(LEAD_COOKIE, leadId, httpOnlyCookie(SIGNUP_COOKIE_MAX_AGE_S));
}

export type SignupCookies = {
  attribution: SignupAttribution | null;
  offer: string | null;
  leadId: string | null;
};

export function readSignupCookies(store: MlCookieReader): SignupCookies {
  return {
    attribution: parseAttribution(store.get(ATTRIBUTION_COOKIE)?.value),
    offer: store.get(OFFER_COOKIE)?.value || null,
    leadId: store.get(LEAD_COOKIE)?.value || null,
  };
}

/** Depois do callback a origem já foi gravada (ou não se aplica): limpa tudo. */
export function clearSignupCookies(store: MlCookieStore) {
  store.delete(ATTRIBUTION_COOKIE);
  store.delete(OFFER_COOKIE);
  store.delete(LEAD_COOKIE);
}

/**
 * Sinal de uso único para o `AuthEventBeacon` disparar `sign_up` ou `login`
 * no dashboard. Não é httpOnly porque quem lê é o navegador.
 */
export function setAuthEventCookie(store: MlCookieStore, event: AuthEvent) {
  store.set(AUTH_EVENT_COOKIE, serializeAuthEvent(event), {
    httpOnly: false,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_EVENT_MAX_AGE_S,
  });
}
