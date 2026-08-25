import { z, ZodError } from "zod";
import { getReviewActorFromHeaders } from "@/lib/auth/review-access";
import { ClusteringError, reviewClusterDecision } from "@/lib/clustering/service";
import { errorResponse } from "@/lib/http/error";

const requestSchema = z.object({
  action: z.enum(["confirm_merge", "keep_separate"]),
  note: z.string().trim().max(1_000).nullable().default(null),
}).strict();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = getReviewActorFromHeaders(request.headers);
  if (!access.ok) {
    return errorResponse(
      access.reason === "unauthenticated" ? 401 : 403,
      access.reason === "unauthenticated" ? "REVIEW_AUTH_REQUIRED" : "REVIEW_ACCESS_DENIED",
      access.reason === "unauthenticated" ? "请先登录后再处理合并建议。" : "当前账号没有聚类审核权限。",
    );
  }
  try {
    const { id } = await context.params;
    const { action, note } = requestSchema.parse(await request.json());
    return Response.json({ data: await reviewClusterDecision(id, action, note, access.actor), meta: { published: false } }, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) return errorResponse(400, "INVALID_INPUT", "聚类审核请求格式不正确。");
    if (error instanceof ClusteringError) return errorResponse(error.httpStatus, error.code, error.publicMessage);
    return errorResponse(500, "CLUSTER_REVIEW_FAILED", "聚类审核失败，请刷新后重试。");
  }
}
