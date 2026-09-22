#!/usr/bin/env node
/**
 * Console TOTP enrollment helper.
 *
 * Prints the otpauth:// URI and a scannable QR code for the Console's
 * passwordless sign-in, using ADMIN_TOTP_SECRET from `.dev.vars` (generating a
 * new secret and appending it when none is present).
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import QRCode from 'qrcode';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const ISSUER = 'Citizenship Hub';
const ACCOUNT = 'admin';

function base32Encode(bytes) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function otpauthUri(secret) {
  const params = new URLSearchParams({
    secret,
    issuer: ISSUER,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${encodeURIComponent(ISSUER)}:${encodeURIComponent(ACCOUNT)}?${params.toString()}`;
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const devVarsPath = join(root, '.dev.vars');

let secret = null;
if (existsSync(devVarsPath)) {
  const content = readFileSync(devVarsPath, 'utf8');
  const match = content.match(/^ADMIN_TOTP_SECRET=(.+)$/m);
  if (match) secret = match[1].trim();
}

let created = false;
if (!secret) {
  secret = base32Encode(randomBytes(20));
  created = true;
  const line = `ADMIN_TOTP_SECRET=${secret}\n`;
  if (existsSync(devVarsPath)) {
    appendFileSync(devVarsPath, `\n# Console TOTP secret (passwordless sign-in)\n${line}`);
  } else {
    writeFileSync(devVarsPath, `# Local-only secrets (gitignored).\n${line}`);
  }
}

const uri = otpauthUri(secret);

console.log('');
console.log('  Console TOTP enrollment');
console.log('  ----------------------');
console.log('');
console.log('  Scan this QR code with your authenticator app (Google Authenticator,');
console.log('  1Password, Authy, etc.), or enter the secret manually.');
console.log('');
console.log(await QRCode.toString(uri, { type: 'terminal', small: true }));
console.log('');
console.log(`  Account:  ${ISSUER} (${ACCOUNT})`);
console.log(`  Secret:   ${secret}`);
console.log(`  otpauth:  ${uri}`);
console.log('');
if (created) {
  console.log('  ✔ Added ADMIN_TOTP_SECRET to .dev.vars');
  console.log('    In production, set the same value as a Cloudflare secret:');
  console.log('    npx wrangler secret put ADMIN_TOTP_SECRET');
} else {
  console.log('  (Secret already present in .dev.vars — showing enrollment for the existing value.)');
  console.log('  In production, set the same value with: npx wrangler secret put ADMIN_TOTP_SECRET');
}
console.log('');
