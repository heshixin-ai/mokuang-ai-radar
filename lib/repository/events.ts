import type { EventFilter, IntelligenceEvent } from "../domain/event";
import { sortEventsBySourcePublishedAt } from "../events/publication-time";
import { demoEvents } from "./demo-events";

export async function listEvents(filter: EventFilter = {}): Promise<IntelligenceEvent[]> {
  if (filter.status && filter.status !== "published") return [];
  try {
    const repository = await defaultRepository();
    const published = await repository.listPublished(filter);
    if (published.length > 0) return sortEventsBySourcePublishedAt(published);
  } catch (error) {
    if (process.env.NODE_ENV !== "test") {
      console.warn("mokuang_public_events_fallback", { name: error instanceof Error ? error.name : "UnknownError" });
    }
  }
  return listDemoEvents(filter);
}

export function listDemoEvents(filter: EventFilter = {}): IntelligenceEvent[] {
  return sortEventsBySourcePublishedAt(demoEvents
    .filter((event) => !filter.type || event.eventType === filter.type)
    .filter((event) => !filter.status || event.status === filter.status));
}

export async function getEventById(id: string): Promise<IntelligenceEvent | null> {
  const demo = getDemoEventById(id);
  if (demo) return demo;
  try {
    return await (await defaultRepository()).getPublished(id);
  } catch (error) {
    if (process.env.NODE_ENV !== "test") {
      console.warn("mokuang_public_event_fallback", { name: error instanceof Error ? error.name : "UnknownError" });
    }
    return null;
  }
}

export function getDemoEventById(id: string): IntelligenceEvent | null {
  return demoEvents.find((event) => event.id === id) ?? null;
}

export function isDemoEvent(event: IntelligenceEvent): boolean {
  return demoEvents.some((item) => item.id === event.id);
}

async function defaultRepository() {
  const [{ getD1 }, { D1EventWorkflowRepository }] = await Promise.all([
    import("@/db"),
    import("./event-workflow"),
  ]);
  return new D1EventWorkflowRepository(getD1());
}
