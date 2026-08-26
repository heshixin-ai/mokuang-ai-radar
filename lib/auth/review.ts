import { getChatGPTUser, chatGPTSignInPath } from "@/app/chatgpt-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReviewActor } from "@/lib/repository/ingestion-contract";
import { isLocalReviewMode, reviewAllowlist } from "./review-access";

export async function requireReviewPageActor(
  environment: Record<string, string | undefined> = process.env,
): Promise<ReviewActor> {
  if (isLocalReviewMode(environment)) {
    return { id: "local-reviewer", email: "local@mokuang.test", displayName: "本地审核员" };
  }

  const requestHeaders = await headers();
  const inviteRole = requestHeaders.get("x-mokuang-invite-role");
  const inviteId = requestHeaders.get("x-mokuang-invite-id");
  if (inviteRole === "admin" && inviteId) {
    return {
      id: `invite:${inviteId}`,
      email: "invite-admin@mokuang.internal",
      displayName: "模况管理员",
    };
  }
  if (inviteRole === "reader") redirect("/review/forbidden");

  const user = await getChatGPTUser();
  if (!user) redirect(chatGPTSignInPath("/review"));
  if (!reviewAllowlist(environment).has(user.email.trim().toLowerCase())) {
    redirect("/review/forbidden");
  }
  return { id: user.userId, email: user.email, displayName: user.displayName };
}
