#!/usr/bin/env node
// Introspect the Cloudflare GraphQL Analytics schema to discover the exact
// field names for a dataset (used while tuning the provider queries).
// Usage: CF_ANALYTICS_API_TOKEN=... node scripts/introspect-cf.mjs <typeName>
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
function loadDevVars() {
  const out = {};
  try {
    for (const line of readFileSync(join(root, '.dev.vars'), 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
    }
  } catch {}
  return out;
}
const env = { ...loadDevVars(), ...process.env };
const token = env.CF_API_TOKEN || env.CF_ANALYTICS_API_TOKEN || env.CLOUDFLARE_API_TOKEN;
if (!token) {
  console.error('Set CF_ANALYTICS_API_TOKEN (or CLOUDFLARE_API_TOKEN).');
  process.exit(1);
}

const endpoint = 'https://api.cloudflare.com/client/v4/graphql';
const target = process.argv[2];

async function gql(query, variables = {}) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) throw new Error(JSON.stringify(json.errors, null, 2));
  return json.data;
}

async function typeInfo(name) {
  const data = await gql(
    `query($name: String!) {
      t: __type(name: $name) {
        name kind
        fields { name type {
          kind name
          ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name } } } } } }
        } }
      }
    }`,
    { name },
  );
  return data.t;
}

function concreteName(t) {
  let cur = t;
  for (let i = 0; i < 8 && cur; i++) {
    if (cur.name && cur.kind !== 'NON_NULL' && cur.kind !== 'LIST') return cur.name;
    cur = cur.ofType;
  }
  return t?.name ?? null;
}

const info = await typeInfo(target);
if (!info) {
  console.log(`No type named "${target}"`);
  process.exit(0);
}
console.log(`type ${info.name} (${info.kind})`);
for (const f of info.fields ?? []) {
  console.log(`  ${f.name}: ${concreteName(f.type) ?? '(unknown)'}`);
}
