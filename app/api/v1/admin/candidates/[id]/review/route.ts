import { z, ZodError } from "zod";
import { getReviewActorFromHeaders } from "@/lib/auth/review-access";
import { IngestionServiceError, reviewEventCandidate } from "@/lib/ingestion/service";
import { errorResponse } from "@/lib/http/error";

const requestSchema = z.object({
  action: z.enum(["approve", "reject", "reopen"]),
  note: z.string().trim().max(1_000).nullable().default(null),
}).strict().superRefine((value, context) => {
  if (value.action === "reject" && !value.note) {
    context.addIssue({ code: "custom", path: ["note"], message: "reject requires a note" });
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
      access.reason === "unauthenticated" ? "请先登录后再审核候选。" : "当前账号没有审核权限。",
    );
  }

  try {
    const { id } = await context.params;
    const { action, note } = requestSchema.parse(await request.json());
    const data = await reviewEventCandidate(id, action, note, access.actor);
    return Response.json({ data, meta: { published: false } }, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) {
      return errorResponse(400, "INVALID_INPUT", "审核请求格式不正确；驳回时必须填写原因。");
    }
    if (error instanceof IngestionServiceError) {
      return errorResponse(error.httpStatus, error.code, error.publicMessage);
    }
    return errorResponse(500, "REVIEW_FAILED", "审核操作失败，请刷新后重试。");
  }
}
