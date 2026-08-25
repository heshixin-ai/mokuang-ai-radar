import { getChatGPTUser, chatGPTSignInPath } from "@/app/chatgpt-auth";
import { redirect } from "next/navigation";
import type { ReviewActor } from "@/lib/repository/ingestion-contract";
import { isLocalReviewMode, reviewAllowlist } from "./review-access";

export async function requireReviewPageActor(
  environment: Record<string, string | undefined> = process.env,
): Promise<ReviewActor> {
  if (isLocalReviewMode(environment)) {
    return { id: "local-reviewer", email: "local@mokuang.test", displayName: "本地审核员" };
  }

  const user = await getChatGPTUser();
  if (!user) redirect(chatGPTSignInPath("/review"));
  if (!reviewAllowlist(environment).has(user.email.trim().toLowerCase())) {
    redirect("/review/forbidden");
  }
  return { id: user.userId, email: user.email, displayName: user.displayName };
}
