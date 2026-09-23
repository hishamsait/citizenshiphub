import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db/client';
import {
  LEAD_STATUSES,
  deleteLead,
  listLeads,
  setLeadStatus,
  type LeadStatus,
} from '../../../lib/db/leads';

/** GET /api/console/leads paginated, filterable list. */
export const GET: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  const db = getDb(locals);

  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '25', 10) || 25),
  );

  const result = await listLeads(
    db,
    {
      q: url.searchParams.get('q') ?? undefined,
      serviceType: url.searchParams.get('serviceType') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
      targetCountryIso: url.searchParams.get('targetCountryIso') ?? undefined,
    },
    page,
    pageSize,
  );

  return json(result);
};

/** PATCH /api/console/leads update a lead's status. */
export const PATCH: APIRoute = async ({ request, locals }) => {
  const body = (await request.json().catch(() => null)) as { id?: number; status?: string } | null;
  if (!body || typeof body.id !== 'number' || typeof body.status !== 'string') {
    return json({ error: 'id and status are required.' }, 400);
  }
  if (!LEAD_STATUSES.includes(body.status as LeadStatus)) {
    return json({ error: `status must be one of: ${LEAD_STATUSES.join(', ')}.` }, 400);
  }
  const ok = await setLeadStatus(getDb(locals), body.id, body.status as LeadStatus);
  if (!ok) return json({ error: 'Lead not found.' }, 404);
  return json({ ok: true });
};

/** DELETE /api/console/leads?id=123 delete a lead. */
export const DELETE: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  const id = parseInt(url.searchParams.get('id') ?? '', 10);
  if (!Number.isFinite(id) || id <= 0) {
    return json({ error: 'id is required.' }, 400);
  }
  const ok = await deleteLead(getDb(locals), id);
  if (!ok) return json({ error: 'Lead not found.' }, 404);
  return json({ ok: true });
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
