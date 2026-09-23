import { defineMiddleware } from 'astro:middleware';
import { insertEvent } from './lib/db/events';
import { SESSION_COOKIE, verifySessionToken } from './lib/auth/session';

/**
 * Console admin middleware:
 *   1. Protects /console (and /api/console) behind a signed session cookie issued
 *      by the passwordless TOTP login page.
 *   2. Issues an anonymous session cookie for lead + event attribution.
 *   3. Records first-party UTM campaign landings as `custom` events. Pageviews
 *      and web vitals are now read straight from Cloudflare, so only UTM-tagged
 *      landings are written to D1 (negligible volume).
 */

const CONSOLE_PUBLIC_PATHS = new Set(['/console/login', '/api/console/login', '/api/console/logout']);

function isConsolePath(pathname: string): boolean {
  return (
    pathname === '/console' ||
    pathname.startsWith('/console/') ||
    pathname.startsWith('/api/console/')
  );
}

function shouldTrackPageview(request: Request, pathname: string): boolean {
  if (request.method !== 'GET') return false;
  if (!(request.headers.get('accept') ?? '').includes('text/html')) return false;
  if (pathname.startsWith('/console')) return false;
  if (pathname.startsWith('/api/')) return false;
  return true;
}

/** User agents that are almost certainly bots/crawlers (server-side events). */
const BOT_UA_PATTERN =
  /bot|crawler|spider|slurp|baiduspider|googlebot|bingbot|yandex|duckduckbot|facebookexternalhit|facebot|twitterbot|pinterest|ahrefs|semrush|mj12|rogerbot|exabot|ia_archiver|petalbot|applebot|uptimerobot|pingdom|monitor/i;

/** Cloudflare's verified-bot flag (when available) plus a UA regex fallback. */
function isBot(
  request: Request,
  cf?: { botManagement?: { verifiedBot?: boolean } } | null,
): boolean {
  if (cf?.botManagement?.verifiedBot) return true;
  return BOT_UA_PATTERN.test(request.headers.get('user-agent') ?? '');
}

/** Extract any present UTM params from a URL into a JSON-ready object (or null). */
function utmProperties(url: URL): Record<string, unknown> | null {
  const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const value = url.searchParams.get(key);
    if (value) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  // 1. Access control for the admin panel.
  if (isConsolePath(pathname) && !CONSOLE_PUBLIC_PATHS.has(pathname)) {
    const secret = context.locals.runtime?.env?.ADMIN_TOTP_SECRET;
    if (typeof secret !== 'string' || secret.length === 0) {
      return new Response('Console is not configured (ADMIN_TOTP_SECRET is missing).', { status: 503 });
    }
    const token = context.cookies.get(SESSION_COOKIE)?.value ?? '';
    const valid = token ? await verifySessionToken(secret, token) : false;
    if (!valid) {
      if (pathname.startsWith('/api/console/')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const next = encodeURIComponent(pathname + context.url.search);
      return context.redirect(`/console/login?next=${next}`, 302);
    }
  }

  // 2. Ensure an anonymous session cookie exists (used by lead + event attribution).
  const track = shouldTrackPageview(context.request, pathname);
  let sessionId = context.cookies.get('ch_sid')?.value ?? '';
  if (track && !sessionId) {
    sessionId = crypto.randomUUID();
    context.cookies.set('ch_sid', sessionId, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  const response = await next();

  // 3. Record a UTM campaign landing (custom 'utm' event) — fire-and-forget,
  //    never for bots. This is the only remaining first-party *traffic* signal;
  //    everything else comes from Cloudflare.
  if (track && sessionId) {
    const utm = utmProperties(context.url);
    if (utm) {
      try {
        const runtime = context.locals.runtime;
        const cf = runtime?.cf;
        if (!isBot(context.request, cf)) {
          const db = runtime?.env?.DB;
          if (db) {
            runtime?.ctx?.waitUntil(
              insertEvent(db, {
                sessionId,
                type: 'custom',
                path: pathname,
                country: cf?.country ?? null,
                properties: { action: 'utm', ...utm },
              }).catch(() => {}),
            );
          }
        }
      } catch {
        // Tracking must never break a page render.
      }
    }
  }

  return response;
});
