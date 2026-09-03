import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const SCRYPT_SALT = Buffer.from("shopping1a1_ml_cred_v1", "utf8");

function deriveKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error("ENCRYPTION_KEY is not set");
  }
  return scryptSync(raw, SCRYPT_SALT, 32);
}

/** Format: v1:ivB64u:tagB64u:cipherB64u (base64url parts). */
export function encryptAppSecret(plainText: string): string {
  const key = deriveKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const ivU = iv.toString("base64url");
  const tagU = tag.toString("base64url");
  const encU = enc.toString("base64url");
  return `v1:${ivU}:${tagU}:${encU}`;
}

export function decryptAppSecret(payload: string): string {
  const key = deriveKey();
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("invalid_cipher_format");
  }
  const [, ivU, tagU, encU] = parts;
  const iv = Buffer.from(ivU, "base64url");
  const tag = Buffer.from(tagU, "base64url");
  const enc = Buffer.from(encU, "base64url");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export function isEncryptionKeyConfigured(): boolean {
  return Boolean(process.env.ENCRYPTION_KEY?.trim());
}
