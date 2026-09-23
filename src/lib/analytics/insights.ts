import type { Db } from '../db/client';
import * as events from '../db/events';
import * as leads from '../db/leads';
import { sinceSql } from './types';
import {
  trafficFromEnv,
  type CloudflareAnalyticsEnv,
  type CloudflareTraffic,
} from './cloudflare';

export interface Insight {
  id: string;
  category: 'traffic' | 'leads' | 'content' | 'performance';
  tone: 'positive' | 'neutral' | 'negative';
  title: string;
  body: string;
}

function pct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

/**
 * Deterministic, rule-based insights. Traffic signals (pageviews, visitors,
 * top pages) come from Cloudflare; leads/content come from D1.
 */
export async function generateInsights(
  db: Db,
  rangeDays: number,
  traffic: CloudflareTraffic,
): Promise<Insight[]> {
  const currentSince = sinceSql(rangeDays);
  const priorSince = sinceSql(rangeDays * 2);

  const [leadDays, serviceSplit, countrySplit, withoutGuides] = await Promise.all([
    leads.leadsByDay(db, priorSince),
    leads.leadsByService(db, currentSince),
    leads.leadsByCountry(db, currentSince),
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM countries c LEFT JOIN country_guides g ON g.iso2 = c.iso2 WHERE g.iso2 IS NULL`,
      )
      .first<{ n: number }>(),
  ]);

  const currentLeads = leadDays
    .filter((d) => d.day >= currentSince)
    .reduce((s, d) => s + d.count, 0);
  const previousLeads = leadDays
    .filter((d) => d.day < currentSince)
    .reduce((s, d) => s + d.count, 0);
  const currentViews = traffic.pageviews;
  const visitors = traffic.visitors;

  if (currentLeads === 0 && currentViews === 0) {
    return [
      {
        id: 'empty',
        category: 'traffic',
        tone: 'neutral',
        title: 'Waiting for first visitors',
        body: `No traffic or leads have been recorded in the last ${rangeDays} days. Insights will appear automatically once visitors start arriving.`,
      },
    ];
  }

  const insights: Insight[] = [];

  const leadTrend = pct(currentLeads, previousLeads);
  if (leadTrend !== null && currentLeads > 0) {
    insights.push({
      id: 'lead-trend',
      category: 'leads',
      tone: leadTrend >= 0 ? 'positive' : 'negative',
      title: leadTrend >= 0 ? 'Lead volume trending up' : 'Lead volume dipped',
      body: `${currentLeads} leads in the last ${rangeDays} days ${leadTrend >= 0 ? 'up' : 'down'} ${Math.abs(leadTrend).toFixed(0)}% vs the prior ${rangeDays}-day period.`,
    });
  }

  if (serviceSplit.length > 0 && currentLeads > 0) {
    const top = serviceSplit[0];
    insights.push({
      id: 'top-service',
      category: 'leads',
      tone: 'neutral',
      title: 'Most requested service',
      body: `${top.label} drives ${top.count} leads (${((top.count / currentLeads) * 100).toFixed(0)}% of the total).`,
    });
  }

  if (countrySplit.length > 0) {
    const top = countrySplit[0];
    insights.push({
      id: 'top-destination',
      category: 'leads',
      tone: 'neutral',
      title: 'Top destination of interest',
      body: `${top.label} is the most requested destination with ${top.count} leads.`,
    });
  }

  if (visitors > 0 && currentLeads > 0) {
    const rate = (currentLeads / visitors) * 100;
    insights.push({
      id: 'conversion',
      category: 'leads',
      tone: rate >= 2 ? 'positive' : 'neutral',
      title: 'Conversion rate',
      body: `${rate.toFixed(1)} leads per 100 visitors over the last ${rangeDays} days.`,
    });
  }

  if (traffic.topPaths.length > 0) {
    insights.push({
      id: 'top-page',
      category: 'traffic',
      tone: 'neutral',
      title: 'Most viewed page',
      body: `“${traffic.topPaths[0].path}” is the most viewed page with ${traffic.topPaths[0].views} views.`,
    });
  }

  const gaps = withoutGuides?.n ?? 0;
  if (gaps > 0) {
    insights.push({
      id: 'content-gap',
      category: 'content',
      tone: 'neutral',
      title: 'Content coverage gap',
      body: `${gaps} countries still have no editorial guide — a candidate for content expansion.`,
    });
  }

  return insights.slice(0, 6);
}
const INSIGHTS_MODEL = '@cf/meta/llama-3.1-8b-instruct';
// Cheaper/free alternatives: '@cf/meta/llama-3.2-3b-instruct', '@cf/meta/llama-3.2-1b-instruct', '@cf/google/gemma-7b-it-lora'

interface AiRuntime {
  AI?: {
    run(model: string, inputs: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
  };
}

const SYSTEM_PROMPT = `You are an analytics co-pilot for "Citizenship Hub", a website about global passports, visa mobility and citizenship-by-descent/investment guides. Given a JSON digest of the site's recent analytics, produce 3 to 6 concise, specific, actionable insights for the site owner. Each insight must reference concrete figures from the digest and suggest a next step where useful. Return ONLY a JSON object (no markdown fences) of this shape:
{
  "insights": [
    {"category": "traffic", "tone": "neutral", "title": "short headline", "body": "one or two sentences with specific numbers"}
  ]
}
"category" must be one of: traffic, leads, content, performance. "tone" must be one of: positive, neutral, negative.`;

function extractJson(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const VALID_CATEGORIES = new Set(['traffic', 'leads', 'content', 'performance']);
const VALID_TONES = new Set(['positive', 'neutral', 'negative']);

function normalizeInsights(raw: Record<string, unknown>): Insight[] {
  const list = raw.insights;
  if (!Array.isArray(list)) return [];
  const out: Insight[] = [];
  for (const item of list) {
    const obj = (item ?? {}) as Record<string, unknown>;
    const category = VALID_CATEGORIES.has(String(obj.category)) ? (String(obj.category) as Insight['category']) : 'traffic';
    const tone = VALID_TONES.has(String(obj.tone)) ? (String(obj.tone) as Insight['tone']) : 'neutral';
    const title = String(obj.title ?? '').trim();
    const body = String(obj.body ?? '').trim();
    if (!title || !body) continue;
    out.push({ id: `ai-${out.length + 1}-${category}`, category, tone, title, body });
    if (out.length >= 6) break;
  }
  return out;
}

interface Digest {
  windowDays: number;
  traffic: { pageviews: number; visitors: number };
  sources: events.SourceStat[];
  campaigns: events.UtmStat[];
  search: { total: number; noResultRatePct: number | null; topQueries: events.SearchQueryStat[] };
  leads: {
    total: number;
    conversionRatePct: number | null;
    topServices: leads.FieldCount[];
    topDestinations: leads.FieldCount[];
    serviceDestination: leads.ServiceCountry[];
    visitorGeo: leads.FieldCount[];
  };
  content: { countries: number; guides: number; coveragePct: number; withoutGuides: number };
  geo: events.CountryStat[];
  devices: events.DeviceStat[];
  topPages: events.PathStat[];
  performance: { metric: string; p75: number | null }[];
}
async function buildDigest(db: Db, rangeDays: number, traffic: CloudflareTraffic): Promise<Digest> {
  const since = sinceSql(rangeDays);
  const [search, leadCount, serviceSplit, countrySplit, matrix, leadGeo, campaigns, totalCountries, totalGuides, withoutGuides] =
    await Promise.all([
      events.searchStats(db, since),
      leads.countLeads(db, since),
      leads.leadsByService(db, since),
      leads.leadsByCountry(db, since),
      leads.leadsByServiceCountry(db, since),
      leads.leadsByVisitorCountry(db, since),
      events.utmBreakdown(db, since),
      db.prepare('SELECT COUNT(*) AS n FROM countries').first<{ n: number }>(),
      db.prepare('SELECT COUNT(*) AS n FROM country_guides').first<{ n: number }>(),
      db
        .prepare(
          'SELECT COUNT(*) AS n FROM countries c LEFT JOIN country_guides g ON g.iso2 = c.iso2 WHERE g.iso2 IS NULL',
        )
        .first<{ n: number }>(),
    ]);

  const countries = totalCountries?.n ?? 0;
  const guides = totalGuides?.n ?? 0;

  return {
    windowDays: rangeDays,
    traffic: { pageviews: traffic.pageviews, visitors: traffic.visitors },
    sources: traffic.sources.slice(0, 6),
    campaigns: campaigns.slice(0, 6),
    search: { total: search.total, noResultRatePct: search.noResultRate, topQueries: search.queries.slice(0, 5) },
    leads: {
      total: leadCount,
      conversionRatePct: traffic.visitors > 0 ? (leadCount / traffic.visitors) * 100 : null,
      topServices: serviceSplit.slice(0, 5),
      topDestinations: countrySplit.slice(0, 5),
      serviceDestination: matrix.slice(0, 8),
      visitorGeo: leadGeo.slice(0, 5),
    },
    content: {
      countries,
      guides,
      coveragePct: countries > 0 ? (guides / countries) * 100 : 0,
      withoutGuides: withoutGuides?.n ?? 0,
    },
    geo: traffic.countries.slice(0, 8),
    devices: traffic.devices,
    topPages: traffic.topPaths.slice(0, 8),
    performance: traffic.performance.metrics,
  };
}

/**
 * Generate insights with the Workers AI model, falling back to the
 * deterministic rule-based generator when no AI binding is available,
 * there is no data, or the model call/parse fails.
 */
export async function generateAiInsights(
  env: AiRuntime & CloudflareAnalyticsEnv,
  db: Db,
  rangeDays: number,
): Promise<Insight[]> {
  const traffic = await trafficFromEnv(env, rangeDays);
  if (!env.AI) return generateInsights(db, rangeDays, traffic);
  try {
    const digest = await buildDigest(db, rangeDays, traffic);
    if (digest.traffic.pageviews === 0 && digest.leads.total === 0) {
      return generateInsights(db, rangeDays, traffic);
    }
    const result = await env.AI.run(INSIGHTS_MODEL, {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(digest) },
      ],
      max_tokens: 1024,
      temperature: 0.2,
      response_format: { type: 'json_object' },
    });
    const content = typeof result === 'string' ? result : (result as { response?: string } | null)?.response;
    if (!content) return generateInsights(db, rangeDays, traffic);
    const parsed = extractJson(content);
    if (!parsed) return generateInsights(db, rangeDays, traffic);
    const insights = normalizeInsights(parsed);
    return insights.length > 0 ? insights : generateInsights(db, rangeDays, traffic);
  } catch {
    return generateInsights(db, rangeDays, traffic);
  }
}
