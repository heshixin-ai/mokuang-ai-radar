import { ZodError } from "zod";
import { getReviewActorFromHeaders } from "@/lib/auth/review-access";
import { getClusterDashboard } from "@/lib/clustering/service";
import { errorResponse } from "@/lib/http/error";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = getReviewActorFromHeaders(request.headers);
  if (!access.ok) {
    return errorResponse(
      access.reason === "unauthenticated" ? 401 : 403,
      access.reason === "unauthenticated" ? "REVIEW_AUTH_REQUIRED" : "REVIEW_ACCESS_DENIED",
      access.reason === "unauthenticated" ? "请先登录后再查看聚类建议。" : "当前账号没有聚类审核权限。",
    );
  }
  try {
    return Response.json({ data: await getClusterDashboard(), meta: { published: false } }, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof ZodError) return errorResponse(500, "CLUSTER_DATA_INVALID", "聚类数据未通过结构校验。");
    return errorResponse(500, "CLUSTER_DASHBOARD_FAILED", "聚类建议暂时无法读取。");
  }
}
