/**
 * Eventos do funil de cadastro, empurrados para o `dataLayer` do Google Tag
 * Manager. O GTM transforma cada um em evento do GA4 e o `sign_up` na conversão
 * do Google Ads (configuração fica no contêiner, não no código).
 *
 * Fora de produção o contêiner não carrega (`GoogleTag`), mas o push continua
 * indo para `window.dataLayer`: dá para conferir o funil pelo console.
 */
export type FunnelEvent =
  | "cta_click"
  | "demo_interaction"
  | "connect_view"
  | "lead_submit"
  | "oauth_start"
  | "oauth_error"
  | "sign_up"
  | "login";

export type FunnelEventParams = Record<
  string,
  string | number | boolean | undefined
>;

type DataLayerWindow = Window & { dataLayer?: unknown[] };

export function track(event: FunnelEvent, params: FunnelEventParams = {}): void {
  if (typeof window === "undefined") return;
  const w = window as DataLayerWindow;
  w.dataLayer = w.dataLayer || [];
  w.dataLayer.push({ event, ...params });
}
