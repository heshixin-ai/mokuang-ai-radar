import { describe, expect, it, vi } from "vitest";
import type { IntelligenceEvent } from "@/lib/domain/event";
import { deliverEmail } from "@/lib/subscriptions/email";
import { hashToken } from "@/lib/subscriptions/crypto";
import { selectDigestEventsForDate } from "@/lib/subscriptions/digest";
import { subscribeInputSchema } from "@/lib/subscriptions/types";

describe("subscriptions", () => {
  it("normalizes email and enforces explicit consent", () => {
    const parsed = subscribeInputSchema.parse({ email: "User@Example.com", topics: ["model_release"], consent: true });
    expect(parsed.email).toBe("user@example.com");
    expect(() => subscribeInputSchema.parse({ ...parsed, consent: false })).toThrow();
  });

  it("hashes confirmation tokens without storing the raw value", async () => {
    expect(await hashToken("opaque-confirmation-token-1234567890")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("uses Resend HTTPS API with idempotency", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ id: "email-1" }), { status: 200 }));
    const result = await deliverEmail({ to: "user@example.com", subject: "日报", html: "<p>内容</p>", idempotencyKey: "digest-1" }, {
      EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_test", EMAIL_FROM: "模况 <digest@example.com>", PUBLIC_SITE_URL: "https://example.com",
    }, fetcher as typeof fetch);
    expect(result).toEqual({ status: "sent", providerId: "email-1" });
    expect(fetcher).toHaveBeenCalledWith("https://api.resend.com/emails", expect.objectContaining({ method: "POST" }));
  });

  it("selects digest events by the source publication date instead of the site publication date", () => {
    const sourceToday = event("source-today", "2026-08-27T00:30:00.000Z", "2026-08-26T16:30:00.000Z");
    const siteTodayOnly = event("site-today-only", "2026-08-27T01:00:00.000Z", "2026-08-26T15:59:59.000Z");

    expect(selectDigestEventsForDate([sourceToday, siteTodayOnly], "2026-08-27").map((item) => item.id))
      .toEqual(["source-today"]);
  });

  it("does not fall back to the site publication date when source time is unavailable", () => {
    const item = event("missing-source-time", "2026-08-27T01:00:00.000Z", "2026-08-26T16:30:00.000Z");
    item.sources = [];

    expect(selectDigestEventsForDate([item], "2026-08-27")).toEqual([]);
  });
});

function event(id: string, sitePublishedAt: string, sourcePublishedAt: string): IntelligenceEvent {
  return {
    id,
    publishedAt: sitePublishedAt,
    sources: [{ publishedAt: sourcePublishedAt }],
  } as IntelligenceEvent;
}
