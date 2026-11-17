/**
 * Origem do cadastro: de qual anúncio/campanha veio a conta nova.
 *
 * Fluxo: `AttributionCapture` (cliente, root layout) grava `maipo_attr` quando
 * a URL traz UTM ou id de clique do Google; o signin (POST da `/conectar`) grava
 * `maipo_offer` e `maipo_lead`; o callback do OAuth lê os três ao criar a
 * organização e grava em `Organization.signupSource`. Assim dá para contar
 * cadastros por campanha no banco, sem depender do GTM (que bloqueador de
 * anúncio derruba).
 *
 * Módulo puro: roda no cliente e no servidor.
 */

export const ATTRIBUTION_COOKIE = "maipo_attr";
export const OFFER_COOKIE = "maipo_offer";
export const LEAD_COOKIE = "maipo_lead";
/** Lido pelo `AuthEventBeacon` no dashboard; por isso não é httpOnly. */
export const AUTH_EVENT_COOKIE = "maipo_auth_evt";

export const ATTRIBUTION_MAX_AGE_S = 30 * 86_400;

export const ATTRIBUTION_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "gclid",
  "gbraid",
  "wbraid",
] as const;

type AttributionKey = (typeof ATTRIBUTION_KEYS)[number];

export type SignupAttribution = Partial<Record<AttributionKey, string>> & {
  /** Caminho da página onde a visita com UTM caiu (ex.: `/beta`). */
  landing?: string;
  capturedAt?: string;
};

const MAX_VALUE_LENGTH = 200;

function clip(value: string): string {
  return value.trim().slice(0, MAX_VALUE_LENGTH);
}

/**
 * Atribuição a partir da URL de entrada, ou `null` sem UTM/id de clique
 * (visita direta não sobrescreve a origem de um anúncio anterior).
 */
export function attributionFromSearch(
  search: string,
  pathname: string,
  now: Date = new Date(),
): SignupAttribution | null {
  const params = new URLSearchParams(search);
  const out: SignupAttribution = {};
  let found = false;
  for (const key of ATTRIBUTION_KEYS) {
    const value = params.get(key);
    if (value && value.trim()) {
      out[key] = clip(value);
      found = true;
    }
  }
  if (!found) return null;
  out.landing = clip(pathname || "/");
  out.capturedAt = now.toISOString();
  return out;
}

export function serializeAttribution(attribution: SignupAttribution): string {
  return encodeURIComponent(JSON.stringify(attribution));
}

/** Lê o cookie aceitando só as chaves conhecidas; lixo vira `null`. */
export function parseAttribution(
  raw: string | undefined,
): SignupAttribution | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const record = parsed as Record<string, unknown>;
  const out: SignupAttribution = {};
  let found = false;
  for (const key of [...ATTRIBUTION_KEYS, "landing", "capturedAt"] as const) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      out[key] = clip(value);
      found = true;
    }
  }
  return found ? out : null;
}

export type AuthEvent = { event: "sign_up" | "login"; offer?: string };

export function serializeAuthEvent({ event, offer }: AuthEvent): string {
  return offer ? `${event}:${offer}` : event;
}

export function parseAuthEvent(raw: string | undefined): AuthEvent | null {
  if (!raw) return null;
  const [event, offer] = decodeURIComponent(raw).split(":", 2);
  if (event !== "sign_up" && event !== "login") return null;
  return offer ? { event, offer } : { event };
}
