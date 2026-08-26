import { describe, expect, it } from "vitest";
import {
  createInviteSession,
  hashInviteCode,
  normalizeInviteCode,
  readInviteCookie,
  safeInviteReturnPath,
  verifyInviteSession,
} from "@/lib/auth/invite-access";
import { getReviewActorFromHeaders } from "@/lib/auth/review-access";

const secret = "test-secret-that-is-at-least-thirty-two-bytes-long";

describe("invite access", () => {
  it("normalizes and hashes invite codes deterministically", async () => {
    expect(normalizeInviteCode(" mk-abcd-2345-efgh ")).toBe("MK-ABCD-2345-EFGH");
    expect(await hashInviteCode("mk-abcd-2345-efgh")).toBe(await hashInviteCode("MK-ABCD-2345-EFGH"));
  });

  it("creates a signed session that cannot be tampered with", async () => {
    const now = new Date("2026-08-27T00:00:00.000Z");
    const token = await createInviteSession({ inviteId: "inv_alpha_01", role: "reader" }, secret, now);
    expect(await verifyInviteSession(token, secret, new Date("2026-08-28T00:00:00.000Z")))
      .toMatchObject({ inviteId: "inv_alpha_01", role: "reader" });

    const [payload, signature] = token.split(".");
    expect(await verifyInviteSession(`${payload}x.${signature}`, secret, now)).toBeNull();
  });

  it("rejects expired sessions", async () => {
    const token = await createInviteSession(
      { inviteId: "inv_alpha_01", role: "reader" },
      secret,
      new Date("2026-08-01T00:00:00.000Z"),
    );
    expect(await verifyInviteSession(token, secret, new Date("2026-08-27T00:00:00.000Z"))).toBeNull();
  });

  it("extracts only the invite cookie", () => {
    expect(readInviteCookie("theme=light; mokuang_access=abc.def; other=value")).toBe("abc.def");
  });

  it("keeps return paths same-origin and outside the invite page", () => {
    expect(safeInviteReturnPath("/events/evt_1?from=invite#top")).toBe("/events/evt_1?from=invite#top");
    expect(safeInviteReturnPath("https://example.com")).toBe("/");
    expect(safeInviteReturnPath("//example.com/path")).toBe("/");
    expect(safeInviteReturnPath("/invite?returnTo=/review")).toBe("/");
  });

  it("allows only admin invite sessions into review APIs", () => {
    const readerHeaders = new Headers({ "x-mokuang-invite-id": "inv_alpha_01", "x-mokuang-invite-role": "reader" });
    const adminHeaders = new Headers({ "x-mokuang-invite-id": "inv_admin_01", "x-mokuang-invite-role": "admin" });

    expect(getReviewActorFromHeaders(readerHeaders, { NODE_ENV: "production" }))
      .toEqual({ ok: false, reason: "forbidden" });
    expect(getReviewActorFromHeaders(adminHeaders, { NODE_ENV: "production" }))
      .toMatchObject({ ok: true, actor: { id: "invite:inv_admin_01" } });
  });
});
