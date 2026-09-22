import type { APIRoute } from 'astro';

const SERVICE_TYPES = new Set(['Legal Help', 'Translation', 'Golden Visa', 'Citizenship by Investment', 'Updates']);

export const POST: APIRoute = async ({ request, locals }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, 400);
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 200) : '';
  const targetCountryIso =
    typeof body.targetCountryIso === 'string' ? body.targetCountryIso.trim().toUpperCase() : '';
  const serviceType = typeof body.serviceType === 'string' ? body.serviceType.trim() : '';

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'A valid email is required.' }, 400);
  }
  if (targetCountryIso && !/^[A-Z]{2}$/.test(targetCountryIso)) {
    return json({ error: 'targetCountryIso must be a two-letter ISO code.' }, 400);
  }
  if (!SERVICE_TYPES.has(serviceType)) {
    return json({ error: 'serviceType must be one of: Legal Help, Translation, Golden Visa, Citizenship by Investment, Updates.' }, 400);
  }

  const db = locals.runtime.env.DB;
  const result = await db
    .prepare('INSERT INTO leads (email, name, target_country_iso, service_type) VALUES (?, ?, ?, ?)')
    .bind(email, name, targetCountryIso, serviceType)
    .run();

  return json({ ok: true, id: result.meta.last_row_id ?? null }, 201);
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
