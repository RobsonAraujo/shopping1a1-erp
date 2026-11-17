/**
 * Contêiner do Google Tag Manager (Google Ads + GA4).
 *
 * É o snippet oficial do GTM: o push de `gtm.start`/`gtm.js` é o que dispara os
 * gatilhos de "Visualização de página" (Conversion Linker inclusive). A versão
 * anterior só carregava o `gtm.js`, sem esse push, e nenhuma tag de página
 * disparava. `beforeInteractive` (no root layout) põe o snippet no HTML
 * inicial, antes de qualquer `track()` do funil (`src/lib/analytics/track.ts`).
 *
 * A conversão da campanha é o evento `sign_up` (conta nova, ver
 * `AuthEventBeacon`), não a visualização de `/dashboard`, que também contava
 * quem só voltou a entrar. Nas páginas públicas o Conversion Linker guarda o
 * clique do anúncio num cookie first-party, que sobrevive à ida ao OAuth do ML.
 *
 * Só em produção: preview e dev inflariam as conversões que o lance automático
 * usa para decidir onde gastar.
 */
const GTM_ID = "GTM-PDK32ZXL";

export function isGoogleTagEnabled() {
  return process.env.VERCEL_ENV === "production";
}

/**
 * Snippet oficial do GTM. O `<Script strategy="beforeInteractive">` que o
 * carrega fica no próprio `src/app/layout.tsx`: é onde o App Router exige
 * scripts `beforeInteractive` (e onde a regra de lint do Next os aceita).
 */
export const GOOGLE_TAG_SNIPPET = `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_ID}');`;

/** Fallback sem JavaScript; vai logo no início do `<body>`. */
export function GoogleTagNoScript() {
  if (!isGoogleTagEnabled()) return null;

  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
        height="0"
        width="0"
        style={{ display: "none", visibility: "hidden" }}
        title="Google Tag Manager"
      />
    </noscript>
  );
}
