import { z, ZodError } from "zod";
import { getReviewActorFromHeaders } from "@/lib/auth/review-access";
import { EventWorkflowError, transitionEventPublication } from "@/lib/events/service";
import { errorResponse } from "@/lib/http/error";

const requestSchema = z.object({
  action: z.enum(["publish", "withdraw"]),
  note: z.string().trim().max(1_000).nullable().default(null),
}).strict().superRefine((value, context) => {
  if (value.action === "withdraw" && !value.note) {
    context.addIssue({ code: "custom", path: ["note"], message: "withdraw requires a note" });
  }
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = getReviewActorFromHeaders(request.headers);
  if (!access.ok) {
    return errorResponse(
      access.reason === "unauthenticated" ? 401 : 403,
      access.reason === "unauthenticated" ? "REVIEW_AUTH_REQUIRED" : "REVIEW_ACCESS_DENIED",
      access.reason === "unauthenticated" ? "请先登录后再执行发布操作。" : "当前账号没有发布权限。",
    );
  }
  try {
    const { id } = await context.params;
    const { action, note } = requestSchema.parse(await request.json());
    const data = await transitionEventPublication(id, action, note, access.actor);
    return Response.json({ data, meta: { published: data.status === "published" } }, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) {
      return errorResponse(400, "INVALID_INPUT", "发布请求格式不正确；撤下时必须填写原因。");
    }
    if (error instanceof EventWorkflowError) return errorResponse(error.httpStatus, error.code, error.publicMessage);
    return errorResponse(500, "PUBLICATION_FAILED", "发布操作失败，请刷新后重试。");
  }
}
