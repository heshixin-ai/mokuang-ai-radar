import { ZodError } from "zod";
import { getReviewActorFromHeaders } from "@/lib/auth/review-access";
import { EventWorkflowError, reviseEvent } from "@/lib/events/service";
import { eventEditInputSchema } from "@/lib/events/types";
import { errorResponse } from "@/lib/http/error";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = getReviewActorFromHeaders(request.headers);
  if (!access.ok) {
    return errorResponse(
      access.reason === "unauthenticated" ? 401 : 403,
      access.reason === "unauthenticated" ? "REVIEW_AUTH_REQUIRED" : "REVIEW_ACCESS_DENIED",
      access.reason === "unauthenticated" ? "请先登录后再编辑事件。" : "当前账号没有编辑权限。",
    );
  }
  try {
    const { id } = await context.params;
    const data = await reviseEvent(id, eventEditInputSchema.parse(await request.json()), access.actor);
    return Response.json({ data, meta: { published: false, revisionCreated: true } }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) return errorResponse(400, "INVALID_INPUT", "事件内容不完整，或修订说明少于 3 个字。");
    if (error instanceof EventWorkflowError) return errorResponse(error.httpStatus, error.code, error.publicMessage);
    return errorResponse(500, "EVENT_REVISION_FAILED", "事件修订保存失败，原版本没有变化。");
  }
}
