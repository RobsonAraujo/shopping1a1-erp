/** Textos voltados ao usuário sobre a consulta CNPJ.ws (não expor env vars). */

export const CNPJ_WS_BANNER_TITLE =
  "Consulta de CNPJ contribuinte (opcional)";

export const CNPJ_WS_BANNER_BODY =
  "Este recurso não está configurado no momento. Quando o Mercado Livre informa se o comprador PJ é contribuinte de ICMS, usamos essa informação — ela é confiável e já cobre a maior parte das vendas.";

export const CNPJ_WS_WARNING_NOT_CONFIGURED =
  "Consulta extra de CNPJ (CNPJ.ws) não configurada. Vendas em que o Mercado Livre informou o tipo de contribuinte foram calculadas com esse dado. Demais vendas para PJ sem essa informação foram tratadas como não-contribuinte (DIFAL).";

export function cnpjWsWarningStubFallbackCount(
  count: number,
  cnpjWsEnabled: boolean,
): string {
  const base = `${count} venda(s) para PJ sem tipo de contribuinte informado pelo Mercado Livre — calculadas como não-contribuinte (DIFAL).`;
  if (cnpjWsEnabled) {
    return `${base} A consulta CNPJ.ws também não retornou resultado para esses CNPJs.`;
  }
  return base;
}
