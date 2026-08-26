import type { ReviewActor } from "@/lib/repository/ingestion-contract";

export type ReviewAccessResult =
  | { ok: true; actor: ReviewActor }
  | { ok: false; reason: "unauthenticated" | "forbidden" };

export function getReviewActorFromHeaders(
  requestHeaders: Headers,
  environment: Record<string, string | undefined> = process.env,
): ReviewAccessResult {
  if (hasValidAutomationToken(requestHeaders, environment)) {
    return {
      ok: true,
      actor: {
        id: "review-automation",
        email: "automation@mokuang.internal",
        displayName: "模况受控自动化",
      },
    };
  }

  if (isLocalReviewMode(environment)) {
    return {
      ok: true,
      actor: { id: "local-reviewer", email: "local@mokuang.test", displayName: "本地审核员" },
    };
  }

  const inviteRole = requestHeaders.get("x-mokuang-invite-role");
  const inviteId = requestHeaders.get("x-mokuang-invite-id");
  if (inviteRole === "admin" && inviteId) {
    return {
      ok: true,
      actor: {
        id: `invite:${inviteId}`,
        email: "invite-admin@mokuang.internal",
        displayName: "模况管理员",
      },
    };
  }
  if (inviteRole === "reader") return { ok: false, reason: "forbidden" };

  const id = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email")?.trim().toLowerCase();
  if (!id || !email) return { ok: false, reason: "unauthenticated" };
  if (!reviewAllowlist(environment).has(email)) return { ok: false, reason: "forbidden" };
  return { ok: true, actor: { id, email, displayName: email } };
}

function hasValidAutomationToken(
  requestHeaders: Headers,
  environment: Record<string, string | undefined>,
): boolean {
  const expected = environment.REVIEW_AUTOMATION_TOKEN?.trim();
  const authorization = requestHeaders.get("authorization");
  if (!expected || expected.length < 32 || !authorization?.startsWith("Bearer ")) return false;
  return constantTimeEqual(authorization.slice(7), expected);
}

function constantTimeEqual(received: string, expected: string): boolean {
  if (received.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= received.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

export function isLocalReviewMode(environment: Record<string, string | undefined>): boolean {
  const developmentRuntime = environment.NODE_ENV
    ? environment.NODE_ENV === "development"
    : import.meta.env.DEV;
  return developmentRuntime && (environment.REVIEW_AUTH_MODE ?? "local") === "local";
}

export function reviewAllowlist(environment: Record<string, string | undefined>): Set<string> {
  return new Set(
    (environment.REVIEW_ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}
