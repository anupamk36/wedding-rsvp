import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** 256-bit random token, URL-safe. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function secretKey(): Buffer {
  const secret = process.env.APP_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("APP_SECRET must be set to at least 32 characters in production.");
    }
    return createHash("sha256").update("gatherly-insecure-development-secret").digest();
  }
  return createHash("sha256").update(`gatherly:token-encryption:${secret}`).digest();
}

/** AES-256-GCM; output is base64url(iv | tag | ciphertext). */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

export function decrypt(payload: string): string {
  const buf = Buffer.from(payload, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", secretKey(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}
