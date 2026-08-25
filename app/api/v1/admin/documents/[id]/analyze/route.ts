import { getReviewActorFromHeaders } from "@/lib/auth/review-access";
import { analyzeSourceDocument, IngestionServiceError } from "@/lib/ingestion/service";
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
      access.reason === "unauthenticated" ? "请先登录后再分析内容。" : "当前账号没有分析权限。",
    );
  }

  try {
    const { id } = await context.params;
    const data = await analyzeSourceDocument(id);
    return Response.json({ data, meta: { persisted: true, published: false } }, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof IngestionServiceError) {
      return errorResponse(error.httpStatus, error.code, error.publicMessage);
    }
    return errorResponse(500, "ANALYSIS_FAILED", "分析失败，内容已保留以便重试。");
  }
}
