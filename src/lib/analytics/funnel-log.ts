/**
 * Linha estruturada `[funnel]` nos logs do servidor (Vercel) para cada etapa do
 * cadastro que passa pelo backend. É a contagem que não depende do GTM, que
 * bloqueador de anúncio derruba no navegador. Nunca logar telefone ou e-mail.
 *
 * Exemplo de busca nos logs: `[funnel]` + `"step":"oauth_callback"`.
 */
export type FunnelLogStep = "oauth_start" | "oauth_callback" | "oauth_error";

export function logFunnel(
  step: FunnelLogStep,
  data: Record<string, string | number | boolean | null | undefined> = {},
): void {
  console.info("[funnel]", JSON.stringify({ step, ...data }));
}
