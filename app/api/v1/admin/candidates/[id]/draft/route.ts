import { getReviewActorFromHeaders } from "@/lib/auth/review-access";
import { createEventDraft, EventWorkflowError } from "@/lib/events/service";
import { errorResponse } from "@/lib/http/error";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = getReviewActorFromHeaders(request.headers);
  if (!access.ok) {
    return errorResponse(
      access.reason === "unauthenticated" ? 401 : 403,
      access.reason === "unauthenticated" ? "REVIEW_AUTH_REQUIRED" : "REVIEW_ACCESS_DENIED",
      access.reason === "unauthenticated" ? "请先登录后再生成草稿。" : "当前账号没有草稿权限。",
    );
  }
  try {
    const { id } = await context.params;
    const data = await createEventDraft(id, access.actor);
    return Response.json({ data, meta: { published: false } }, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof EventWorkflowError) return errorResponse(error.httpStatus, error.code, error.publicMessage);
    return errorResponse(500, "DRAFT_GENERATION_FAILED", "正式事件草稿生成失败，候选内容仍已保留。");
  }
}
