import type { Db } from '../db/client';
import { listCountrySources } from '../db/country-sources';
import * as scrapes from '../db/scrapes';

const DEFAULT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const MAX_SOURCE_CHARS = 6000;
const FETCH_TIMEOUT_MS = 15_000;

interface AiRuntime {
  AI?: {
    run(model: string, inputs: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
  };
}

interface PageText {
  name: string;
  url: string;
  category: string;
  text: string;
}

interface AiFact {
  field: string;
  value: string;
  confidence: number;
  evidence: string;
}

interface AiExtraction {
  summary: string;
  facts: AiFact[];
}

const SYSTEM_PROMPT = `You are an immigration & citizenship data-extraction assistant.
Given text from a country's official government immigration portal and Wikipedia nationality-law page, extract the LATEST factual information.
Return ONLY a JSON object (no markdown fences) of this exact shape:
{
  "summary": "one or two sentences summarising the latest citizenship/immigration facts found",
  "facts": [
    {"field":"citizenship_by_descent","value":"Yes","confidence":0.9,"evidence":"short quote or paraphrase"},
    {"field":"naturalisation_years","value":"5","confidence":0.9,"evidence":"..."},
    {"field":"dual_citizenship_allowed","value":"Yes","confidence":0.9,"evidence":"..."},
    {"field":"official_fee_eur","value":"250","confidence":0.8,"evidence":"..."},
    {"field":"citizenship_by_investment","value":"No","confidence":0.8,"evidence":"..."},
    {"field":"golden_visa","value":"Yes","confidence":0.8,"evidence":"..."},
    {"field":"marriage_years","value":"3","confidence":0.7,"evidence":"..."},
    {"field":"latest_changes","value":"short description","confidence":0.7,"evidence":"..."}
  ]
}
Use "Unclear" when a fact is not stated. Keep evidence short.`;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text: string, max: number): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

async function fetchPageText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'user-agent': 'citizenshiphub-scraper (+https://citizenshiphub.com)' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const contentType = res.headers.get('content-type') ?? '';
  const body = await res.text();
  return contentType.includes('html') ? stripHtml(body) : body;
}

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

function normalizeExtraction(raw: Record<string, unknown>): AiExtraction {
  const summary = typeof raw.summary === 'string' ? raw.summary : '';
  const rawFacts = Array.isArray(raw.facts) ? raw.facts : [];
  const facts = rawFacts
    .map((f) => {
      const obj = (f ?? {}) as Record<string, unknown>;
      const confidence = typeof obj.confidence === 'number' ? Math.min(1, Math.max(0, obj.confidence)) : 0;
      return {
        field: String(obj.field ?? '').trim(),
        value: String(obj.value ?? '').trim(),
        confidence,
        evidence: String(obj.evidence ?? '').trim(),
      };
    })
    .filter((f) => f.field && f.value);
  return { summary, facts };
}

async function runAi(env: AiRuntime, text: string): Promise<AiExtraction | null> {
  if (!env.AI) return null;
  const result = await env.AI.run(DEFAULT_MODEL, {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: text },
    ],
    max_tokens: 2048,
    temperature: 0.2,
    response_format: { type: 'json_object' },
  });
  const content = typeof result === 'string' ? result : (result as { response?: string } | null)?.response;
  if (!content) return null;
  const parsed = extractJson(content);
  return parsed ? normalizeExtraction(parsed) : null;
}

function fallbackExtract(): AiExtraction {
  return {
    summary:
      'No AI model was available for this run — the deterministic fallback extracted no structured facts. Review the genuine source links below.',
    facts: [],
  };
}

/**
 * Scrape a single country's genuine sources (official government portals and
 * Wikipedia nationality-law pages) and, when the Workers AI binding is present,
 * extract the latest citizenship/immigration facts via the model.
 */
export async function scrapeCountry(env: AiRuntime, db: Db, iso2: string): Promise<scrapes.ScrapeRun> {
  const run = await scrapes.insertScrapeRun(db, iso2);
  try {
    const sources = await listCountrySources(db, iso2);
    const pages: PageText[] = [];
    const sourceResults: scrapes.ScrapeSourceResult[] = [];

    for (const source of sources) {
      if (!source.url) continue;
      try {
        const text = await fetchPageText(source.url);
        pages.push({ name: source.name, url: source.url, category: source.category, text });
        sourceResults.push({ name: source.name, url: source.url, category: source.category, status: 'success' });
      } catch (e) {
        sourceResults.push({
          name: source.name,
          url: source.url,
          category: source.category,
          status: 'failed',
          error: e instanceof Error ? e.message : 'Fetch failed',
        });
      }
    }

    const combined = pages
      .map((p) => `### ${p.name} (${p.category})\n${truncate(p.text, MAX_SOURCE_CHARS)}`)
      .join('\n\n');
    const extraction = (await runAi(env, combined)) ?? fallbackExtract();

    const updated: scrapes.ScrapeRun = {
      ...run,
      status: 'success',
      summary: extraction.summary,
      facts: extraction.facts,
      sources: sourceResults,
      model: env.AI ? DEFAULT_MODEL : 'deterministic-fallback',
      fetchedAt: new Date().toISOString(),
    };
    await scrapes.saveScrapeRun(db, updated);
    return (await scrapes.getScrapeRun(db, run.id)) ?? updated;
  } catch (e) {
    const updated: scrapes.ScrapeRun = {
      ...run,
      status: 'failed',
      error: e instanceof Error ? e.message : 'Scrape failed',
      fetchedAt: new Date().toISOString(),
    };
    await scrapes.saveScrapeRun(db, updated);
    return (await scrapes.getScrapeRun(db, run.id)) ?? updated;
  }
}

