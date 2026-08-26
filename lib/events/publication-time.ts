import type { IntelligenceEvent } from "@/lib/domain/event";

/**
 * Returns the publication time supplied by the event's primary source.
 * Source records are hydrated with the primary source first. The site's own
 * publication timestamp is deliberately not used as a fallback because it is
 * an ingestion timestamp rather than the time the news was originally issued.
 */
export function getEventSourcePublishedAt(event: IntelligenceEvent): string | null {
  const sourcePublishedAt = event.sources[0]?.publishedAt;
  if (!sourcePublishedAt) return null;

  return Number.isFinite(Date.parse(sourcePublishedAt)) ? sourcePublishedAt : null;
}

export function sortEventsBySourcePublishedAt(events: IntelligenceEvent[]): IntelligenceEvent[] {
  return events.toSorted((left, right) => {
    const leftTime = getEventSourcePublishedAt(left);
    const rightTime = getEventSourcePublishedAt(right);
    const leftTimestamp = leftTime ? Date.parse(leftTime) : Number.NEGATIVE_INFINITY;
    const rightTimestamp = rightTime ? Date.parse(rightTime) : Number.NEGATIVE_INFINITY;
    return rightTimestamp - leftTimestamp;
  });
}
