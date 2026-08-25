import { describe, expect, it, vi } from "vitest";
import { deliverEmail } from "@/lib/subscriptions/email";
import { hashToken } from "@/lib/subscriptions/crypto";
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
});
