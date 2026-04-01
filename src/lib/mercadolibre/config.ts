export function getMercadoLibreConfig() {
  const clientId = process.env.MERCADOLIBRE_CLIENT_ID;
  const clientSecret = process.env.MERCADOLIBRE_CLIENT_SECRET;
  const redirectUri = process.env.MERCADOLIBRE_REDIRECT_URI;
  const authBase =
    process.env.MERCADOLIBRE_AUTH_BASE ?? "https://auth.mercadolivre.com.br";
  const apiBase =
    process.env.MERCADOLIBRE_API_BASE ?? "https://api.mercadolibre.com";

  return {
    clientId,
    clientSecret,
    redirectUri,
    authBase,
    apiBase,
  };
}

export function requireMercadoLibreOAuthConfig() {
  const { clientId, clientSecret, redirectUri } = getMercadoLibreConfig();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Missing MERCADOLIBRE_CLIENT_ID, MERCADOLIBRE_CLIENT_SECRET, or MERCADOLIBRE_REDIRECT_URI",
    );
  }
  return { clientId, clientSecret, redirectUri };
}
