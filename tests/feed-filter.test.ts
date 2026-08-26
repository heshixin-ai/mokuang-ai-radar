import { describe, expect, it } from "vitest";
import type { IntelligenceEvent } from "@/lib/domain/event";
import { filterEventsByTime, filterEventsByType } from "@/lib/events/feed-filter";

const referenceTime = "2026-08-27T04:00:00.000Z";

describe("public event feed filters", () => {
  it("uses the Shanghai calendar day for today's events", () => {
    const events = [
      event("today", "2026-08-26T16:30:00.000Z"),
      event("yesterday", "2026-08-26T15:59:59.000Z"),
    ];

    expect(filterEventsByTime(events, "today", referenceTime).map((item) => item.id)).toEqual(["today"]);
  });

  it("filters rolling 7-day and 30-day ranges", () => {
    const events = [
      event("recent", "2026-08-23T04:00:00.000Z"),
      event("older", "2026-08-15T04:00:00.000Z"),
      event("archive", "2026-06-01T04:00:00.000Z"),
    ];

    expect(filterEventsByTime(events, "7d", referenceTime).map((item) => item.id)).toEqual(["recent"]);
    expect(filterEventsByTime(events, "30d", referenceTime).map((item) => item.id)).toEqual(["recent", "older"]);
    expect(filterEventsByTime(events, "all", referenceTime)).toHaveLength(3);
  });

  it("combines with the event type filter", () => {
    const events = [event("model", referenceTime, "model_release"), event("api", referenceTime, "api_change")];
    expect(filterEventsByType(events, "api_change").map((item) => item.id)).toEqual(["api"]);
    expect(filterEventsByType(events, "all")).toHaveLength(2);
  });
});

function event(
  id: string,
  publishedAt: string,
  eventType: IntelligenceEvent["eventType"] = "model_release",
): IntelligenceEvent {
  return { id, publishedAt, eventType } as IntelligenceEvent;
}
