import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCodeForTokens } from "@/lib/mercadolibre/oauth";
import { fetchMe } from "@/lib/mercadolibre/api";
import {
  logServerError,
  oauthRedirectErrorParam,
} from "@/lib/infra/server-public-error";
import {
  upsertSellerCredentials,
  type PersistSellerCredentialsFailure,
} from "@/lib/mercadolibre/persist-seller-tokens";
import {
  clearOAuthStateCookie,
  mergeTokensWithExistingRefresh,
  readOAuthState,
  setSessionCookies,
} from "@/lib/mercadolibre/session";
import { ensureOrganizationForMlSeller } from "@/lib/organizations/ensure-organization";
import { prisma } from "@/lib/db/db";
import { logFunnel } from "@/lib/analytics/funnel-log";
import {
  BETA_OFFER,
  isOfferActive,
  offerTrialEndsAt,
} from "@/lib/marketing/campaign-offer";
import {
  clearSignupCookies,
  readSignupCookies,
  setAuthEventCookie,
} from "@/lib/marketing/signup-cookies";

/**
 * Sem credencial gravada o vendedor até navega (os cookies de sessão bastam pro
 * browser), mas cron de catálogo e snapshot de inventário não conseguem token e
 * falham só pra ele — conta meio quebrada, difícil de diagnosticar depois.
 * Melhor recusar o login com um código próprio.
 *
 * Única exceção: fora de produção o ambiente roda sem `ENCRYPTION_KEY`.
 */
function credentialFailureBlocksLogin(
  reason: PersistSellerCredentialsFailure,
): boolean {
  if (reason === "encryption_key_missing") {
    return process.env.NODE_ENV === "production";
  }
  return true;
}

/**
 * Erros voltam para a `/conectar`, que explica o aviso do Mercado Livre e
 * oferece tentar de novo (a landing `/` ainda aceita `?error=` de links antigos).
 */
function errorRedirect(request: NextRequest, code: string) {
  logFunnel("oauth_error", { reason: code });
  const url = new URL("/conectar", request.url);
  url.searchParams.set("error", code);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const oauthError = request.nextUrl.searchParams.get("error");

  if (oauthError) {
    return errorRedirect(request, oauthError);
  }

  if (!code || !state) {
    return errorRedirect(request, "missing_code_or_state");
  }

  const cookieStore = await cookies();
  const expected = readOAuthState(cookieStore);
  if (!expected || expected !== state) {
    return errorRedirect(request, "invalid_state");
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const tokensForSession = mergeTokensWithExistingRefresh(tokens, cookieStore);
    const me = await fetchMe(tokensForSession.access_token);

    const persisted = await upsertSellerCredentials(me.id, tokensForSession);
    if (!persisted.ok && credentialFailureBlocksLogin(persisted.reason)) {
      const failed = errorRedirect(request, "credentials_not_persisted");
      clearOAuthStateCookie(failed.cookies);
      return failed;
    }

    const signup = readSignupCookies(cookieStore);
    const now = new Date();
    // A oferta vale se o visitante passou pela /beta e conectou dentro do prazo.
    const offer =
      signup.offer === BETA_OFFER.id && isOfferActive(now) ? BETA_OFFER.id : null;

    const { organization, created } = await ensureOrganizationForMlSeller(
      me.id,
      { email: me.email, nickname: me.nickname },
      {
        source: signup.attribution,
        offer,
        trialEndsAt: offer ? offerTrialEndsAt(now) : null,
      },
    );

    if (created && signup.leadId) {
      // Lead é nível plataforma (sem organizationId): não passa pelo guard de tenant.
      await prisma.lead
        .updateMany({
          where: { id: signup.leadId, convertedOrganizationId: null },
          data: { convertedOrganizationId: organization.id, convertedAt: now },
        })
        .catch((e) => logServerError("mercadolibre/callback:lead", e));
    }

    logFunnel("oauth_callback", {
      result: created ? "sign_up" : "login",
      offer: created ? offer : undefined,
      has_lead: signup.leadId !== null,
      utm_campaign: signup.attribution?.utm_campaign,
    });

    const res = NextResponse.redirect(new URL("/dashboard", request.url));
    clearOAuthStateCookie(res.cookies);
    clearSignupCookies(res.cookies);
    setAuthEventCookie(res.cookies, {
      event: created ? "sign_up" : "login",
      offer: created && offer ? offer : undefined,
    });
    setSessionCookies(res.cookies, tokensForSession, me.id);
    return res;
  } catch (e) {
    logServerError("mercadolibre/callback", e);
    // Em dev o helper devolve a mensagem já codificada para URL.
    return errorRedirect(
      request,
      decodeURIComponent(oauthRedirectErrorParam(e, "oauth_failed")),
    );
  }
}
