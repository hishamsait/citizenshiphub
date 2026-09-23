import { defineMiddleware } from 'astro:middleware';
import { insertEvent } from './lib/db/events';
import { detectDevice } from './lib/utils';
import { SESSION_COOKIE, verifySessionToken } from './lib/auth/session';

/**
 * Console admin middleware:
 *   1. Protects /console (and /api/console) behind a signed session cookie issued
 *      by the passwordless TOTP login page.
 *   2. Records first-party pageviews for public HTML pages (fire-and-forget).
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

/** Fraction of pageviews to record. Analytics stay statistically valid while
 *  write volume is cut ~10x. Set to 1 to track every pageview. */
const PAGEVIEW_SAMPLE_RATE = 0.1;

/** User agents that are almost certainly bots/crawlers (server-side pageviews). */
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

/** Deterministic per-session bucket in [0,1) so a session is always tracked or never tracked. */
function sampleBucket(sessionId: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < sessionId.length; i++) {
    h ^= sessionId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0x100000000;
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

  // 2. Ensure an anonymous session cookie exists for first-party analytics.
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

  // 3. Record the pageview after the response is produced (never block it).
  //    Skip bots entirely and sample down to a fraction of pageviews so the
  //    D1 write volume scales with real, sampled traffic — not crawler noise.
  if (track && sessionId) {
    try {
      const runtime = context.locals.runtime;
      const cf = runtime?.cf;
      if (!isBot(context.request, cf) && sampleBucket(sessionId) < PAGEVIEW_SAMPLE_RATE) {
        const db = runtime?.env?.DB;
        if (db) {
          const ua = context.request.headers.get('user-agent') ?? '';
          runtime?.ctx?.waitUntil(
            insertEvent(db, {
              sessionId,
              type: 'pageview',
              path: pathname,
              referrer: context.request.headers.get('referer'),
              country: cf?.country ?? null,
              device: detectDevice(ua),
              properties: utmProperties(context.url),
            }).catch(() => {}),
          );
        }
      }
    } catch {
      // Tracking must never break a page render.
    }
  }

  return response;
});
