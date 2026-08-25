import { getReviewActorFromHeaders } from "@/lib/auth/review-access";
import { clusterApprovedCandidate, ClusteringError } from "@/lib/clustering/service";
import { errorResponse } from "@/lib/http/error";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = getReviewActorFromHeaders(request.headers);
  if (!access.ok) {
    return errorResponse(
      access.reason === "unauthenticated" ? 401 : 403,
      access.reason === "unauthenticated" ? "REVIEW_AUTH_REQUIRED" : "REVIEW_ACCESS_DENIED",
      access.reason === "unauthenticated" ? "请先登录后再检查重复事件。" : "当前账号没有聚类权限。",
    );
  }
  try {
    const { id } = await context.params;
    return Response.json({ data: await clusterApprovedCandidate(id), meta: { published: false } }, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof ClusteringError) return errorResponse(error.httpStatus, error.code, error.publicMessage);
    return errorResponse(500, "CLUSTERING_FAILED", "重复事件检查失败，候选内容仍已保留。");
  }
}
