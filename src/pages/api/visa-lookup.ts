import type { APIRoute } from 'astro';

interface VisaRow {
  requirement: string;
  allowed_stay_days: number | null;
  destination_name: string;
}

export const GET: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  const passport = (url.searchParams.get('from') ?? '').trim().toUpperCase();
  const destination = (url.searchParams.get('to') ?? '').trim().toUpperCase();

  if (!/^[A-Z]{2}$/.test(passport) || !/^[A-Z]{2}$/.test(destination)) {
    return json({ error: 'Missing or invalid parameters. Use /api/visa-lookup?from=DE&to=US' }, 400);
  }

  // Access Cloudflare D1 via locals.runtime.env.DB
  const db = locals.runtime.env.DB;
  const row = await db
    .prepare(
      `SELECT r.requirement, r.allowed_stay_days, c.name AS destination_name
       FROM visa_rules r
       JOIN countries c ON r.destination_iso = c.iso2
       WHERE r.passport_iso = ? AND r.destination_iso = ?`,
    )
    .bind(passport, destination)
    .first<VisaRow>();

  return json(row ?? { requirement: 'Unknown' });
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
