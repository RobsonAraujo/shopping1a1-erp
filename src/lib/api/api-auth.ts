import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getValidAccessToken, readSession } from "@/lib/mercadolibre/session";
import { prisma } from "@/lib/db/db";
import type { OrganizationStatus } from "@/generated/prisma";

export type AuthContext = {
  token: string;
  userId: number;
};

/** Resolves the current ML session for a Route Handler, refreshing the access
 * token if needed. Returns `null` when the request is not authenticated. */
export async function requireAuth(): Promise<AuthContext | null> {
  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);
  const { userId } = readSession(cookieStore);
  if (!token || userId === undefined) return null;
  return { token, userId };
}

export function unauthorizedResponse(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

const ACTIVE_STATUSES: OrganizationStatus[] = ["trialing", "active"];

export type OrgAuthContext = AuthContext & {
  organizationId: string;
  organizationStatus: OrganizationStatus;
};

export type RequireOrganizationResult =
  | { ok: true; ctx: OrgAuthContext }
  | {
      ok: false;
      reason: "unauthenticated" | "no_organization" | "blocked";
      status: number;
    };

/**
 * Ponto único de decisão "pode processar este request": autentica via ML,
 * resolve a organização do seller e recusa cedo (antes de qualquer query de
 * negócio ou chamada ao Mercado Livre) se a organização não estiver
 * `trialing`/`active`. Toda rota que lê/escreve dado de negócio ou chama a
 * API do ML deve usar isto em vez de `requireAuth()` puro.
 */
export async function requireOrganization(): Promise<RequireOrganizationResult> {
  const auth = await requireAuth();
  if (!auth) return { ok: false, reason: "unauthenticated", status: 401 };

  const link = await prisma.organizationMlSeller.findUnique({
    where: { mlUserId: auth.userId },
    include: { organization: true },
  });
  // Não deveria acontecer pós-callback (todo login cria o vínculo via
  // ensureOrganizationForMlSeller) — sinaliza erro em vez de criar aqui, pra
  // manter previsível quem cria organizações.
  if (!link) return { ok: false, reason: "no_organization", status: 500 };

  if (!ACTIVE_STATUSES.includes(link.organization.status)) {
    return { ok: false, reason: "blocked", status: 402 };
  }

  return {
    ok: true,
    ctx: {
      ...auth,
      organizationId: link.organizationId,
      organizationStatus: link.organization.status,
    },
  };
}

export function blockedResponse(): NextResponse {
  return NextResponse.json({ error: "organization_blocked" }, { status: 402 });
}
