import { z, ZodError } from "zod";
import { getReviewActorFromHeaders } from "@/lib/auth/review-access";
import { IngestionServiceError, runSourceIngestion } from "@/lib/ingestion/service";
import { errorResponse } from "@/lib/http/error";

const requestSchema = z.object({ sourceId: z.string().min(1).max(100) }).strict();

export async function POST(request: Request) {
  const access = getReviewActorFromHeaders(request.headers);
  if (!access.ok) {
    return errorResponse(
      access.reason === "unauthenticated" ? 401 : 403,
      access.reason === "unauthenticated" ? "REVIEW_AUTH_REQUIRED" : "REVIEW_ACCESS_DENIED",
      access.reason === "unauthenticated" ? "请先登录后再运行采集。" : "当前账号没有采集权限。",
    );
  }

  try {
    const { sourceId } = requestSchema.parse(await request.json());
    const data = await runSourceIngestion(sourceId, access.actor);
    return Response.json(
      { data, meta: { analyzed: false, published: false } },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) {
      return errorResponse(400, "INVALID_INPUT", "采集请求格式不正确。");
    }
    if (error instanceof IngestionServiceError) {
      return errorResponse(error.httpStatus, error.code, error.publicMessage);
    }
    return errorResponse(500, "INGESTION_FAILED", "采集失败，已保留运行状态。");
  }
}
