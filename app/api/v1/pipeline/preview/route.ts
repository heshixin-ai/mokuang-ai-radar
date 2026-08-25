import { ZodError } from "zod";
import { runMockPipeline } from "@/lib/ai/mock-pipeline";
import { errorResponse } from "@/lib/http/error";

export async function POST(request: Request) {
  try {
    const input = await request.json();
    const result = runMockPipeline(input);
    return Response.json({ data: result, meta: { demo: true, persisted: false } });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) {
      return errorResponse(400, "INVALID_INPUT", "来源材料格式不正确。");
    }
    return errorResponse(500, "PIPELINE_PREVIEW_FAILED", "预览处理失败，请稍后重试。");
  }
}
