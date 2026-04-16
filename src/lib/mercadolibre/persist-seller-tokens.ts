import {
  decryptAppSecret,
  encryptAppSecret,
  isEncryptionKeyConfigured,
} from "@/lib/app-secret-crypto";
import { prisma } from "@/lib/db";
import { logServerError } from "@/lib/server-public-error";
import { refreshAccessToken } from "@/lib/mercadolibre/oauth";
import type { TokenResponse } from "@/lib/mercadolibre/types";

const ACCESS_BUFFER_MS = 90_000;

function accessExpiresAtFromTokens(tokens: TokenResponse): Date {
  const sec = tokens.expires_in ?? 3600;
  return new Date(Date.now() + sec * 1000);
}

/**
 * Persist ML OAuth tokens for a seller (encrypted at rest).
 * Call after successful code exchange and after refresh in the browser session.
 */
export async function upsertSellerCredentials(
  mlUserId: number,
  tokens: TokenResponse,
): Promise<void> {
  if (!isEncryptionKeyConfigured()) {
    logServerError(
      "upsertSellerCredentials",
      new Error(
        "ENCRYPTION_KEY is not set; ML seller tokens were not persisted to the database",
      ),
    );
    return;
  }

  const existing = await prisma.mlSellerCredentials.findUnique({
    where: { mlUserId },
  });

  const fromTokens =
    typeof tokens.refresh_token === "string" ? tokens.refresh_token.trim() : "";
  let refreshPlain: string | null = fromTokens || null;
  if (!refreshPlain && existing) {
    try {
      refreshPlain = decryptAppSecret(existing.refreshEnc);
    } catch (e) {
      logServerError("upsertSellerCredentials decrypt existing refresh", e);
      return;
    }
  }
  if (!refreshPlain) {
    logServerError(
      "upsertSellerCredentials",
      new Error(
        "Missing refresh_token and no stored refresh for seller. Ensure OAuth authorization uses scope offline_access (re-login after enabling), or reuse session cookie on callback.",
      ),
    );
    return;
  }

  try {
    await prisma.mlSellerCredentials.upsert({
      where: { mlUserId },
      create: {
        mlUserId,
        refreshEnc: encryptAppSecret(refreshPlain),
        accessEnc: encryptAppSecret(tokens.access_token),
        accessExpiresAt: accessExpiresAtFromTokens(tokens),
      },
      update: {
        refreshEnc: encryptAppSecret(refreshPlain),
        accessEnc: encryptAppSecret(tokens.access_token),
        accessExpiresAt: accessExpiresAtFromTokens(tokens),
      },
    });
  } catch (e) {
    logServerError("upsertSellerCredentials", e);
  }
}

/**
 * Returns a valid access token using DB-stored credentials (decrypt, refresh if needed).
 */
export async function resolveSellerAccessToken(mlUserId: number): Promise<string | null> {
  if (!isEncryptionKeyConfigured()) {
    return null;
  }

  const row = await prisma.mlSellerCredentials.findUnique({
    where: { mlUserId },
  });
  if (!row) return null;

  let refreshPlain: string;
  try {
    refreshPlain = decryptAppSecret(row.refreshEnc);
  } catch (e) {
    logServerError(`resolveSellerAccessToken decrypt refresh mlUserId=${mlUserId}`, e);
    return null;
  }

  const now = Date.now();
  if (
    row.accessEnc &&
    row.accessExpiresAt &&
    row.accessExpiresAt.getTime() - now > ACCESS_BUFFER_MS
  ) {
    try {
      return decryptAppSecret(row.accessEnc);
    } catch {
      // fall through to refresh
    }
  }

  try {
    const tokens = await refreshAccessToken(refreshPlain);
    await upsertSellerCredentials(mlUserId, tokens);
    return tokens.access_token;
  } catch (e) {
    logServerError(`resolveSellerAccessToken refresh mlUserId=${mlUserId}`, e);
    return null;
  }
}
