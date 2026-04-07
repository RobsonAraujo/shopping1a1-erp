/**
 * Evita vazar detalhes de erros internos / respostas de APIs para o cliente em produção.
 * Em desenvolvimento, a mensagem ajuda a depurar.
 */
const isDev = process.env.NODE_ENV === "development";

export function logServerError(context: string, error: unknown): void {
  console.error(`[${context}]`, error);
}

/** Mensagem segura para JSON de API (502, etc.). */
export function apiErrorPayload(error: unknown, genericCode: string): { error: string } {
  if (isDev && error instanceof Error && error.message) {
    return { error: error.message };
  }
  return { error: genericCode };
}

/** Query string `error=` em redirects (OAuth, etc.). */
export function oauthRedirectErrorParam(error: unknown, genericCode: string): string {
  if (isDev && error instanceof Error && error.message) {
    return encodeURIComponent(error.message);
  }
  return genericCode;
}
