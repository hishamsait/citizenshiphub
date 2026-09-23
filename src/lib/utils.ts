import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

export function formatEuro(value: number): string {
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);
}

export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function formatArea(km2: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(km2) + ' km²';
}

export function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatGdpUsdM(millions: number): string {
  const usd = millions * 1_000_000;
  if (usd >= 1e12) return `$${(usd / 1e12).toFixed(1).replace(/\.0$/, '')}T`;
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(1).replace(/\.0$/, '')}B`;
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(0)}M`;
  return `$${Math.round(usd).toLocaleString('en-US')}`;
}

export type Device = 'desktop' | 'mobile' | 'tablet' | 'other';

/** Coarse device classification from a User-Agent string (used for first-party analytics). */
export function detectDevice(userAgent: string): Device {
  const ua = userAgent.toLowerCase();
  if (!ua) return 'other';
  if (/(ipad|tablet|kindle|silk)/.test(ua)) return 'tablet';
  if (/(mobi|iphone|android|ipod|blackberry|opera mini)/.test(ua)) return 'mobile';
  return 'desktop';
}

/** Format an ISO (or date-only) timestamp for display; returns an em dash for empty. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(
    d.getUTCMinutes(),
  )}`;
}

/** Bucket a raw HTTP referrer into a coarse acquisition source (used by analytics). */
export function categorizeReferrer(referrer: string | null | undefined): string {
  if (!referrer) return 'Direct';
  let host: string;
  try {
    host = new URL(referrer).hostname;
  } catch {
    host = referrer;
  }
  if (/google\./i.test(host)) return 'Google';
  if (/bing\./i.test(host)) return 'Bing';
  if (/duckduckgo\./i.test(host)) return 'DuckDuckGo';
  if (/yahoo\./i.test(host)) return 'Yahoo';
  if (/facebook\.|instagram\.|linkedin\.|twitter\.|x\.com|reddit\.|tiktok\./i.test(host)) return 'Social';
  return 'Other';
}
