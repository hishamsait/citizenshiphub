import type { APIRoute } from 'astro';
import { getDb } from '../../lib/db/client';
import { insertEvent, type EventType } from '../../lib/db/events';
import { detectDevice } from '../../lib/utils';

const ALLOWED: EventType[] = ['web_vital', 'search', 'lead_open', 'scroll_depth', 'custom'];

/** POST /api/track client-side first-party events (web vitals, searches, etc.). */
export const POST: APIRoute = async ({ request, cookies, locals }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, 400);
  }

  const type = typeof body.type === 'string' ? body.type : '';
  if (!ALLOWED.includes(type as EventType)) {
    return json({ error: 'Unsupported event type.' }, 400);
  }

  const metric = typeof body.metric === 'string' ? body.metric.slice(0, 40) : null;
  const value = typeof body.value === 'number' ? body.value : null;
  const path = typeof body.path === 'string' ? body.path.slice(0, 500) : null;
  const properties =
    body.properties && typeof body.properties === 'object'
      ? (body.properties as Record<string, unknown>)
      : null;

  const sessionId = cookies.get('ch_sid')?.value ?? 'anon';
  const ua = request.headers.get('user-agent') ?? '';

  await insertEvent(getDb(locals), {
    sessionId,
    type: type as EventType,
    path,
    referrer: request.headers.get('referer'),
    country: locals.runtime?.cf?.country ?? null,
    device: detectDevice(ua),
    metric,
    value,
    properties,
  });

  return json({ ok: true });
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
