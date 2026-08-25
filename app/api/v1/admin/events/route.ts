import { ZodError } from "zod";
import { getReviewActorFromHeaders } from "@/lib/auth/review-access";
import { EventWorkflowError, getEventAdminDashboard } from "@/lib/events/service";
import { errorResponse } from "@/lib/http/error";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = getReviewActorFromHeaders(request.headers);
  if (!access.ok) {
    return errorResponse(
      access.reason === "unauthenticated" ? 401 : 403,
      access.reason === "unauthenticated" ? "REVIEW_AUTH_REQUIRED" : "REVIEW_ACCESS_DENIED",
      access.reason === "unauthenticated" ? "请先登录后再进入发布后台。" : "当前账号没有发布权限。",
    );
  }
  try {
    return Response.json({ data: await getEventAdminDashboard(), meta: { published: false } }, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof EventWorkflowError) return errorResponse(error.httpStatus, error.code, error.publicMessage);
    if (error instanceof ZodError) return errorResponse(500, "EVENT_DATA_INVALID", "事件数据未通过结构校验。");
    return errorResponse(500, "EVENT_DASHBOARD_FAILED", "事件发布数据暂时无法读取。");
  }
}
