import { getD1 } from "@/db";
import type { IntelligenceEvent } from "@/lib/domain/event";
import { D1EventWorkflowRepository } from "@/lib/repository/event-workflow";

export type TimelineSummary = { slug: string; label: string; count: number };
export type Timeline = TimelineSummary & { description: string; events: IntelligenceEvent[] };

export async function listTopicTimelines(): Promise<TimelineSummary[]> {
  const rows = await getD1().prepare(`
    SELECT et.slug, et.label, COUNT(*) AS event_count FROM event_topics et
    JOIN events e ON e.id = et.event_id WHERE e.status = 'published'
    GROUP BY et.slug, et.label ORDER BY event_count DESC, et.label ASC
  `).all<Record<string, unknown>>();
  return rows.results.map((row) => ({ slug: String(row.slug), label: String(row.label), count: Number(row.event_count) }));
}

export async function getTopicTimeline(slug: string): Promise<Timeline | null> {
  const row = await getD1().prepare(`
    SELECT label, COUNT(*) AS event_count FROM event_topics et
    JOIN events e ON e.id = et.event_id WHERE et.slug = ? AND e.status = 'published' GROUP BY label
  `).bind(slug).first<Record<string, unknown>>();
  if (!row) return null;
  const ids = await getD1().prepare(`
    SELECT e.id FROM event_topics et JOIN events e ON e.id = et.event_id
    WHERE et.slug = ? AND e.status = 'published' ORDER BY e.published_at DESC
  `).bind(slug).all<Record<string, unknown>>();
  const repository = new D1EventWorkflowRepository(getD1());
  const events = (await Promise.all(ids.results.map((item) => repository.getPublished(String(item.id))))).filter((event): event is IntelligenceEvent => Boolean(event));
  return { slug, label: String(row.label), count: Number(row.event_count), description: `持续追踪${String(row.label)}相关的产品、模型与生态变化。`, events };
}

export async function listEntityTimelines(): Promise<TimelineSummary[]> {
  const rows = await getD1().prepare(`
    SELECT en.slug, en.name AS label, COUNT(*) AS event_count FROM event_entities ee
    JOIN entities en ON en.id = ee.entity_id JOIN events e ON e.id = ee.event_id
    WHERE e.status = 'published' GROUP BY en.slug, en.name ORDER BY event_count DESC, en.name ASC
  `).all<Record<string, unknown>>();
  return rows.results.map((row) => ({ slug: String(row.slug), label: String(row.label), count: Number(row.event_count) }));
}

export async function getEntityTimeline(slug: string): Promise<Timeline | null> {
  const row = await getD1().prepare(`
    SELECT en.name, en.description, COUNT(*) AS event_count FROM event_entities ee
    JOIN entities en ON en.id = ee.entity_id JOIN events e ON e.id = ee.event_id
    WHERE en.slug = ? AND e.status = 'published' GROUP BY en.name, en.description
  `).bind(slug).first<Record<string, unknown>>();
  if (!row) return null;
  const ids = await getD1().prepare(`
    SELECT e.id FROM event_entities ee JOIN entities en ON en.id = ee.entity_id JOIN events e ON e.id = ee.event_id
    WHERE en.slug = ? AND e.status = 'published' ORDER BY e.published_at DESC
  `).bind(slug).all<Record<string, unknown>>();
  const repository = new D1EventWorkflowRepository(getD1());
  const events = (await Promise.all(ids.results.map((item) => repository.getPublished(String(item.id))))).filter((event): event is IntelligenceEvent => Boolean(event));
  return { slug, label: String(row.name), count: Number(row.event_count), description: String(row.description), events };
}
