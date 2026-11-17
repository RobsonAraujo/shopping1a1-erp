import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { buildAuthorizationUrl } from "@/lib/mercadolibre/oauth";
import {
  logServerError,
  oauthRedirectErrorParam,
} from "@/lib/infra/server-public-error";
import { setOAuthStateCookie } from "@/lib/mercadolibre/session";
import { prisma } from "@/lib/db/db";
import { logFunnel } from "@/lib/analytics/funnel-log";
import { BETA_OFFER, isOfferActive } from "@/lib/marketing/campaign-offer";
import { normalizeLeadPhone } from "@/lib/marketing/lead-phone";
import {
  readSignupCookies,
  setLeadCookie,
  setOfferCookie,
} from "@/lib/marketing/signup-cookies";

/** Erros do início do login voltam para a tela que explica o fluxo. */
const ERROR_PAGE = "/conectar";

function oauthRedirect(status: 302 | 303) {
  const state = randomBytes(24).toString("hex");
  const res = NextResponse.redirect(buildAuthorizationUrl(state), status);
  setOAuthStateCookie(res.cookies, state);
  return res;
}

function errorRedirect(request: Request, e: unknown) {
  logServerError("mercadolibre/signin", e);
  const url = new URL(ERROR_PAGE, request.url);
  // Em dev o helper devolve a mensagem já codificada para URL.
  url.searchParams.set(
    "error",
    decodeURIComponent(oauthRedirectErrorParam(e, "oauth_config")),
  );
  return NextResponse.redirect(url, 303);
}

/** Link direto (compatibilidade): vai ao Mercado Livre sem passar pela `/conectar`. */
export async function GET(request: Request) {
  try {
    const res = oauthRedirect(302);
    logFunnel("oauth_start", { via: "link" });
    return res;
  } catch (e) {
    return errorRedirect(request, e);
  }
}

/**
 * Formulário da `/conectar`: grava o WhatsApp opcional (lead) e a oferta da
 * campanha, depois segue para o Mercado Livre. Nada aqui pode travar o login:
 * telefone inválido é ignorado e falha ao gravar o lead só vai para o log.
 */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const field = (name: string) => {
    const value = form?.get(name);
    return typeof value === "string" ? value : "";
  };

  // Campo invisível: só robô preenche.
  const isBot = field("website").trim() !== "";
  const phone = isBot ? null : normalizeLeadPhone(field("whatsapp"));
  const offer =
    field("offer") === BETA_OFFER.id && isOfferActive() ? BETA_OFFER.id : null;

  const { attribution } = readSignupCookies(await cookies());

  let leadId: string | null = null;
  if (phone) {
    try {
      const lead = await prisma.lead.create({
        data: { phone, source: attribution ?? undefined, offer },
      });
      leadId = lead.id;
    } catch (e) {
      logServerError("mercadolibre/signin:lead", e);
    }
  }

  try {
    // 303: o navegador troca o POST por GET ao seguir para o Mercado Livre.
    const res = oauthRedirect(303);
    if (offer) setOfferCookie(res.cookies, offer);
    if (leadId) setLeadCookie(res.cookies, leadId);
    logFunnel("oauth_start", {
      via: "form",
      has_lead: leadId !== null,
      offer,
      utm_campaign: attribution?.utm_campaign,
    });
    return res;
  } catch (e) {
    return errorRedirect(request, e);
  }
}
