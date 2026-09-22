/**
 * Stateless, signed session cookies for the Console.
 * Format: `<base64url(payload)>.<base64url(hmac-sha256(secret, payload))>`.
 * The signing key is the TOTP secret itself, so no extra secret is required.
 */

export const SESSION_COOKIE = 'ch_console';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

interface SessionPayload {
  iat: number;
  exp: number;
}

function b64urlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(input: string): Uint8Array {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacSha256(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    asBuffer(key),
    { name: 'HMAC', hash: 'SHA-256' },
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

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function createSessionToken(secret: string, nowMs = Date.now()): Promise<string> {
  const payload: SessionPayload = { iat: nowMs, exp: nowMs + SESSION_TTL_SECONDS * 1000 };
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const signature = await hmacSha256(new TextEncoder().encode(secret), payloadBytes);
  return `${b64urlEncode(payloadBytes)}.${b64urlEncode(signature)}`;
}

export async function verifySessionToken(secret: string, token: string): Promise<boolean> {
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payloadB64, signatureB64] = parts;

  let payloadBytes: Uint8Array;
  let signatureBytes: Uint8Array;
  try {
    payloadBytes = b64urlDecode(payloadB64);
    signatureBytes = b64urlDecode(signatureB64);
  } catch {
    return false;
  }

  const expected = await hmacSha256(new TextEncoder().encode(secret), payloadBytes);
  if (!timingSafeEqual(expected, signatureBytes)) return false;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as SessionPayload;
  } catch {
    return false;
  }

  return typeof payload.exp === 'number' && payload.exp > Date.now();
}
