import {
  decryptAppSecret,
  encryptAppSecret,
  isEncryptionKeyConfigured,
} from "@/lib/infra/app-secret-crypto";
import { prisma } from "@/lib/db/db";
import { logServerError } from "@/lib/infra/server-public-error";
import { refreshAccessToken } from "@/lib/mercadolibre/oauth";
import { toDbSellerId } from "@/lib/mercadolibre/seller-id";
import type { TokenResponse } from "@/lib/mercadolibre/types";

const ACCESS_BUFFER_MS = 90_000;

function accessExpiresAtFromTokens(tokens: TokenResponse): Date {
  const sec = tokens.expires_in ?? 3600;
  return new Date(Date.now() + sec * 1000);
}

export type PersistSellerCredentialsFailure =
  | "encryption_key_missing"
  | "missing_refresh_token"
  | "decrypt_failed"
  | "db_read_failed"
  | "db_write_failed";

export type PersistSellerCredentialsResult =
  | { ok: true }
  | { ok: false; reason: PersistSellerCredentialsFailure };

/**
 * Decide qual refresh token persistir: o que veio na resposta do ML ou, quando
 * o ML omite (comum em trocas posteriores), o que já está guardado.
 *
 * Extraída como função pura — `decrypt` é injetado — para ser testável sem
 * banco nem `ENCRYPTION_KEY`.
 */
export function resolveRefreshPlain(args: {
  tokenRefresh: string | undefined;
  existingRefreshEnc: string | null;
  decrypt: (enc: string) => string;
}):
  | { ok: true; refreshPlain: string }
  | { ok: false; reason: "missing_refresh_token" | "decrypt_failed" } {
  const fromTokens =
    typeof args.tokenRefresh === "string" ? args.tokenRefresh.trim() : "";
  if (fromTokens) return { ok: true, refreshPlain: fromTokens };

  if (args.existingRefreshEnc) {
    try {
      const decrypted = args.decrypt(args.existingRefreshEnc).trim();
      if (decrypted) return { ok: true, refreshPlain: decrypted };
    } catch {
      return { ok: false, reason: "decrypt_failed" };
    }
  }

  return { ok: false, reason: "missing_refresh_token" };
}

/**
 * Persist ML OAuth tokens for a seller (encrypted at rest).
 * Call after successful code exchange and after refresh in the browser session.
 *
 * Devolve o motivo da falha em vez de engolir o erro: sem credencial no banco a
 * conta fica meio quebrada (cron de catálogo e snapshot de inventário não
 * conseguem token), então quem chama decide se isso bloqueia o login.
 */
export async function upsertSellerCredentials(
  mlUserId: number,
  tokens: TokenResponse,
): Promise<PersistSellerCredentialsResult> {
  if (!isEncryptionKeyConfigured()) {
    logServerError(
      "upsertSellerCredentials",
      new Error(
        "ENCRYPTION_KEY is not set; ML seller tokens were not persisted to the database",
      ),
    );
    return { ok: false, reason: "encryption_key_missing" };
  }

  // Dentro do try: um id de seller fora de faixa ou uma falha de conexão aqui
  // já subiu como `oauth_failed` genérico no callback (bug do seller
  // 3711648215) em vez de dizer o que aconteceu.
  let existing: { refreshEnc: string } | null;
  try {
    existing = await prisma.mlSellerCredentials.findUnique({
      where: { mlUserId: toDbSellerId(mlUserId) },
      select: { refreshEnc: true },
    });
  } catch (e) {
    logServerError(`upsertSellerCredentials read mlUserId=${mlUserId}`, e);
    return { ok: false, reason: "db_read_failed" };
  }

  const refresh = resolveRefreshPlain({
    tokenRefresh: tokens.refresh_token,
    existingRefreshEnc: existing?.refreshEnc ?? null,
    decrypt: decryptAppSecret,
  });
  if (!refresh.ok) {
    logServerError(
      `upsertSellerCredentials mlUserId=${mlUserId}`,
      new Error(
        refresh.reason === "decrypt_failed"
          ? "Could not decrypt the stored refresh token (ENCRYPTION_KEY rotated?)."
          : "Missing refresh_token and no stored refresh for seller. Ensure OAuth authorization uses scope offline_access (re-login after enabling), or reuse session cookie on callback.",
      ),
    );
    return { ok: false, reason: refresh.reason };
  }

  try {
    await prisma.mlSellerCredentials.upsert({
      where: { mlUserId: toDbSellerId(mlUserId) },
      create: {
        mlUserId: toDbSellerId(mlUserId),
        refreshEnc: encryptAppSecret(refresh.refreshPlain),
        accessEnc: encryptAppSecret(tokens.access_token),
        accessExpiresAt: accessExpiresAtFromTokens(tokens),
      },
      update: {
        refreshEnc: encryptAppSecret(refresh.refreshPlain),
        accessEnc: encryptAppSecret(tokens.access_token),
        accessExpiresAt: accessExpiresAtFromTokens(tokens),
      },
    });
  } catch (e) {
    logServerError(`upsertSellerCredentials write mlUserId=${mlUserId}`, e);
    return { ok: false, reason: "db_write_failed" };
  }

  return { ok: true };
}

/**
 * Returns a valid access token using DB-stored credentials (decrypt, refresh if needed).
 */
export async function resolveSellerAccessToken(mlUserId: number): Promise<string | null> {
  if (!isEncryptionKeyConfigured()) {
    return null;
  }

  const row = await prisma.mlSellerCredentials.findUnique({
    where: { mlUserId: toDbSellerId(mlUserId) },
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
