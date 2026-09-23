/**
 * RFC 6238 TOTP (time-based one-time password) verification on the Web Crypto
 * API runs identically on Cloudflare Workers and Node 18+ with no runtime
 * dependencies.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/=+$/, '').replace(/[\s-]/g, '');
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of clean) {
    const value = BASE32_ALPHABET.indexOf(char);
    if (value === -1) continue;
    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

async function hmacSha1(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    asBuffer(key),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, asBuffer(message));
  return new Uint8Array(signature);
}

/** Copy a Uint8Array into a fresh ArrayBuffer for the Web Crypto API. */
function asBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function counterBuffer(counter: number): Uint8Array {
  const buffer = new Uint8Array(8);
  let value = counter;
  for (let i = 7; i >= 0; i--) {
    buffer[i] = value & 0xff;
    value = Math.floor(value / 256);
  }
  return buffer;
}

/** RFC 4226 dynamic truncation. */
function truncate(hmac: Uint8Array, digits: number): string {
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const code = binary % 10 ** digits;
  return String(code).padStart(digits, '0');
}

export async function generateTotpCode(
  secret: string,
  nowMs = Date.now(),
  period = 30,
  digits = 6,
): Promise<string> {
  const key = base32Decode(secret);
  const counter = Math.floor(nowMs / 1000 / period);
  const hmac = await hmacSha1(key, counterBuffer(counter));
  return truncate(hmac, digits);
}

/** Verifies a 6-digit code, tolerating `window` time steps of clock skew. */
export async function verifyTotp(
  secret: string,
  code: string,
  options: { window?: number; nowMs?: number } = {},
): Promise<boolean> {
  const { window = 1, nowMs = Date.now() } = options;
  const cleaned = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleaned)) return false;
  for (let offset = -window; offset <= window; offset++) {
    const candidate = await generateTotpCode(secret, nowMs + offset * 30_000);
    if (timingSafeEqual(candidate, cleaned)) return true;
  }
  return false;
}

function timingSafeEqual(a: string, b: string): boolean {
  const max = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < max; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}
