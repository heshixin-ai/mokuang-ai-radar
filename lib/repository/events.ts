import type { EventFilter, IntelligenceEvent } from "../domain/event";
import { demoEvents } from "./demo-events";

export function listEvents(filter: EventFilter = {}): IntelligenceEvent[] {
  return demoEvents
    .filter((event) => !filter.type || event.eventType === filter.type)
    .filter((event) => !filter.status || event.status === filter.status)
    .toSorted((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

export function getEventById(id: string): IntelligenceEvent | null {
  return demoEvents.find((event) => event.id === id) ?? null;
}
