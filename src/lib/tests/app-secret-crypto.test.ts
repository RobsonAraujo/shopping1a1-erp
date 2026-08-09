import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  encryptAppSecret,
  decryptAppSecret,
  isEncryptionKeyConfigured,
} from "../app-secret-crypto";

describe("isEncryptionKeyConfigured", () => {
  it("is true when ENCRYPTION_KEY is set in the environment", () => {
    assert.equal(isEncryptionKeyConfigured(), true);
  });
});

describe("encryptAppSecret / decryptAppSecret", () => {
  it("round-trips a plain text string", () => {
    const plain = "meu-refresh-token-secreto";
    const encrypted = encryptAppSecret(plain);
    assert.equal(decryptAppSecret(encrypted), plain);
  });

  it("round-trips an empty string", () => {
    const encrypted = encryptAppSecret("");
    assert.equal(decryptAppSecret(encrypted), "");
  });

  it("round-trips unicode content", () => {
    const plain = "token com açentuação é ção 中文";
    const encrypted = encryptAppSecret(plain);
    assert.equal(decryptAppSecret(encrypted), plain);
  });

  it("produces a 'v1:' prefixed payload with 4 colon-separated parts", () => {
    const encrypted = encryptAppSecret("x");
    const parts = encrypted.split(":");
    assert.equal(parts.length, 4);
    assert.equal(parts[0], "v1");
  });

  it("produces different ciphertext for the same input each time (random IV)", () => {
    const a = encryptAppSecret("same-input");
    const b = encryptAppSecret("same-input");
    assert.notEqual(a, b);
    assert.equal(decryptAppSecret(a), "same-input");
    assert.equal(decryptAppSecret(b), "same-input");
  });

  it("throws on a payload with the wrong format", () => {
    assert.throws(() => decryptAppSecret("not-a-valid-payload"));
  });

  it("throws on a payload with an unsupported version tag", () => {
    const encrypted = encryptAppSecret("x");
    const tampered = encrypted.replace(/^v1:/, "v2:");
    assert.throws(() => decryptAppSecret(tampered));
  });

  it("throws when the ciphertext/tag has been tampered with", () => {
    const encrypted = encryptAppSecret("sensitive-value");
    const parts = encrypted.split(":");
    // flip the last char of the cipher part to corrupt it
    const corrupted = parts[3].slice(0, -1) + (parts[3].at(-1) === "A" ? "B" : "A");
    const tampered = [parts[0], parts[1], parts[2], corrupted].join(":");
    assert.throws(() => decryptAppSecret(tampered));
  });
});
