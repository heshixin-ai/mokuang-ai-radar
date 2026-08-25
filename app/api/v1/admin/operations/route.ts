import { getReviewActorFromHeaders } from "@/lib/auth/review-access";
import { errorResponse } from "@/lib/http/error";
import { getOperationsDashboard } from "@/lib/repository/operations";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const access = getReviewActorFromHeaders(request.headers);
  if (!access.ok) return errorResponse(access.reason === "unauthenticated" ? 401 : 403, "REVIEW_ACCESS_DENIED", "当前账号不能查看运行监控。");
  try {
    return Response.json({ data: await getOperationsDashboard() }, { headers: { "cache-control": "no-store" } });
  } catch {
    return errorResponse(500, "OPERATIONS_DASHBOARD_FAILED", "运行监控暂时无法读取。");
  }
}
