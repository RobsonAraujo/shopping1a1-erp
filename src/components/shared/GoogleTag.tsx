import Script from "next/script";

/**
 * Tag do Google (contêiner do Google Ads). A conversão da campanha é a
 * visualização de `/dashboard`, que só quem conectou a conta ML alcança
 * (middleware manda o resto para `/`). Por isso a tag precisa estar no root
 * layout: nas páginas públicas ela guarda o clique do anúncio num cookie
 * first-party, que sobrevive à ida ao OAuth do Mercado Livre, e no
 * `/dashboard` ela registra a conversão.
 *
 * Só em produção: preview e dev rodariam a mesma regra de URL e inflariam as
 * conversões que o lance automático usa para decidir onde gastar.
 */
const GOOGLE_TAG_ID = "GTM-PDK32ZXL";

export function GoogleTag() {
  if (process.env.VERCEL_ENV !== "production") return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtm.js?id=${GOOGLE_TAG_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-tag-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());`}
      </Script>
    </>
  );
}
