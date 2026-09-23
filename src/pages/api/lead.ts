import type { APIRoute } from 'astro';

const SERVICE_TYPES = new Set(['Legal Help', 'Translation', 'Golden Visa', 'Citizenship by Investment', 'Updates']);

export const POST: APIRoute = async ({ request, cookies, locals }) => {
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

  // Attribution snapshot captured alongside the lead (see LeadModal.astro).
  const sessionId = cookies.get('ch_sid')?.value ?? null;
  const referrer =
    typeof body.referrer === 'string' && body.referrer ? body.referrer.slice(0, 500) : null;
  const landingPath =
    typeof body.landingPath === 'string' && body.landingPath ? body.landingPath.slice(0, 500) : null;
  const utmSource =
    typeof body.utmSource === 'string' && body.utmSource ? body.utmSource.slice(0, 200) : null;
  const utmMedium =
    typeof body.utmMedium === 'string' && body.utmMedium ? body.utmMedium.slice(0, 200) : null;
  const utmCampaign =
    typeof body.utmCampaign === 'string' && body.utmCampaign ? body.utmCampaign.slice(0, 200) : null;
  const country = locals.runtime?.cf?.country ?? null;

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
    .prepare(
      `INSERT INTO leads (
         email, name, target_country_iso, service_type,
         session_id, referrer, landing_path, country,
         utm_source, utm_medium, utm_campaign
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      email,
      name,
      targetCountryIso,
      serviceType,
      sessionId,
      referrer,
      landingPath,
      country,
      utmSource,
      utmMedium,
      utmCampaign,
    )
    .run();

  return json({ ok: true, id: result.meta.last_row_id ?? null }, 201);
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
