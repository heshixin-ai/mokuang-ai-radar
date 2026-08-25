import { getReviewActorFromHeaders } from "@/lib/auth/review-access";
import { getReviewDashboard, IngestionServiceError } from "@/lib/ingestion/service";
import { errorResponse } from "@/lib/http/error";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = getReviewActorFromHeaders(request.headers);
  if (!access.ok) {
    return errorResponse(
      access.reason === "unauthenticated" ? 401 : 403,
      access.reason === "unauthenticated" ? "REVIEW_AUTH_REQUIRED" : "REVIEW_ACCESS_DENIED",
      access.reason === "unauthenticated" ? "请先登录后再进入审核后台。" : "当前账号没有审核权限。",
    );
  }

  try {
    const data = await getReviewDashboard();
    return Response.json({ data, meta: { published: false } }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof IngestionServiceError) {
      return errorResponse(error.httpStatus, error.code, error.publicMessage);
    }
    return errorResponse(500, "DASHBOARD_LOAD_FAILED", "审核数据暂时无法读取。");
  }
}
