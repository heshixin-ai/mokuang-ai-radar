import type { ReviewActor } from "@/lib/repository/ingestion-contract";

export type ReviewAccessResult =
  | { ok: true; actor: ReviewActor }
  | { ok: false; reason: "unauthenticated" | "forbidden" };

export function getReviewActorFromHeaders(
  requestHeaders: Headers,
  environment: Record<string, string | undefined> = process.env,
): ReviewAccessResult {
  if (isLocalReviewMode(environment)) {
    return {
      ok: true,
      actor: { id: "local-reviewer", email: "local@mokuang.test", displayName: "本地审核员" },
    };
  }

  const id = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email")?.trim().toLowerCase();
  if (!id || !email) return { ok: false, reason: "unauthenticated" };
  if (!reviewAllowlist(environment).has(email)) return { ok: false, reason: "forbidden" };
  return { ok: true, actor: { id, email, displayName: email } };
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
