import type { Db } from '../db/client';
import * as events from '../db/events';
import * as leads from '../db/leads';
import { sinceSql } from './types';

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

export async function generateInsights(db: Db, rangeDays: number): Promise<Insight[]> {
  const currentSince = sinceSql(rangeDays);
  const priorSince = sinceSql(rangeDays * 2);

  const [leadDays, viewDays, serviceSplit, countrySplit, withoutGuides, topPages, visitors] =
    await Promise.all([
      leads.leadsByDay(db, priorSince),
      events.pageviewsByDay(db, priorSince),
      leads.leadsByService(db, currentSince),
      leads.leadsByCountry(db, currentSince),
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM countries c LEFT JOIN country_guides g ON g.iso2 = c.iso2 WHERE g.iso2 IS NULL`,
        )
        .first<{ n: number }>(),
      events.topPaths(db, currentSince, 5),
      events.countUniqueVisitors(db, currentSince),
    ]);

  const currentLeads = leadDays
    .filter((d) => d.day >= currentSince)
    .reduce((s, d) => s + d.count, 0);
  const previousLeads = leadDays
    .filter((d) => d.day < currentSince)
    .reduce((s, d) => s + d.count, 0);
  const currentViews = viewDays
    .filter((d) => d.day >= currentSince)
    .reduce((s, d) => s + d.views, 0);

  if (currentLeads === 0 && currentViews === 0) {
    return [
      {
        id: 'empty',
        category: 'traffic',
        tone: 'neutral',
        title: 'Waiting for first visitors',
        body: `No pageviews or leads have been recorded in the last ${rangeDays} days. Insights will appear automatically once traffic starts flowing.`,
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
      body: `${currentLeads} leads in the last ${rangeDays} days — ${leadTrend >= 0 ? 'up' : 'down'} ${Math.abs(leadTrend).toFixed(0)}% vs the prior ${rangeDays}-day period.`,
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

  if (topPages.length > 0) {
    insights.push({
      id: 'top-page',
      category: 'traffic',
      tone: 'neutral',
      title: 'Most viewed page',
      body: `“${topPages[0].path}” is the most viewed page with ${topPages[0].views} views.`,
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
