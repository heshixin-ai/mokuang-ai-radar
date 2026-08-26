import type { EventType, IntelligenceEvent } from "@/lib/domain/event";
import { getEventSourcePublishedAt } from "@/lib/events/publication-time";

export const EVENT_PAGE_SIZE = 9;

export type EventTimeRange = "today" | "7d" | "30d" | "all";

const DAY_MS = 24 * 60 * 60 * 1000;
const shanghaiDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function filterEventsByTime(
  events: IntelligenceEvent[],
  range: EventTimeRange,
  referenceTime: string | number | Date,
): IntelligenceEvent[] {
  if (range === "all") return events;

  const now = new Date(referenceTime);
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) return events;

  if (range === "today") {
    const today = shanghaiDateFormatter.format(now);
    return events.filter((event) => {
      const sourcePublishedAt = getEventSourcePublishedAt(event);
      if (!sourcePublishedAt) return false;
      const publishedAt = new Date(sourcePublishedAt);
      return shanghaiDateFormatter.format(publishedAt) === today;
    });
  }

  const days = range === "7d" ? 7 : 30;
  const earliest = nowMs - days * DAY_MS;
  return events.filter((event) => {
    const sourcePublishedAt = getEventSourcePublishedAt(event);
    if (!sourcePublishedAt) return false;
    const publishedAt = Date.parse(sourcePublishedAt);
    return Number.isFinite(publishedAt) && publishedAt >= earliest && publishedAt <= nowMs;
  });
}

export function filterEventsByType(
  events: IntelligenceEvent[],
  type: "all" | EventType,
): IntelligenceEvent[] {
  return type === "all" ? events : events.filter((event) => event.eventType === type);
}
