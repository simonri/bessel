import crypto from "node:crypto";

export const TOTP_STEP_SECONDS = 30;
const DIGITS = 6;
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export class InvalidTotpSecretError extends Error {
  constructor() {
    super("The TOTP secret isn't valid.");
    this.name = "InvalidTotpSecretError";
  }
}

export function normalizeTotpSecret(secret: string): string {
  return secret.replace(/\s+/g, "").toUpperCase();
}

export function base32Decode(text: string): Buffer {
  const chars = normalizeTotpSecret(text).replace(/=+$/, "");
  if (!chars) throw new InvalidTotpSecretError();
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of chars) {
    const value = BASE32_ALPHABET.indexOf(char);
    if (value === -1) throw new InvalidTotpSecretError();
    buffer = ((buffer << 5) | value) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

/** RFC 4226 HOTP with HMAC-SHA-1. */
export function hotp(key: Buffer, counter: number): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac("sha1", key).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

/** RFC 6238 TOTP (SHA-1, 6 digits, 30 s steps) for a base32 secret. */
export function totp(secret: string, unixMs: number): string {
  const counter = Math.floor(unixMs / 1000 / TOTP_STEP_SECONDS);
  return hotp(base32Decode(secret), counter);
}

/** How long until the next code, plus a second so it is surely current. */
export function msUntilNextCode(unixMs: number): number {
  const stepMs = TOTP_STEP_SECONDS * 1000;
  return stepMs - (unixMs % stepMs) + 1000;
}
