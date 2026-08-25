import { ZodError } from "zod";
import { readAiConfig } from "@/lib/ai/config";
import { AiPipelineError } from "@/lib/ai/errors";
import { runMockPipeline } from "@/lib/ai/mock-pipeline";
import { runDeepSeekPipeline } from "@/lib/ai/pipeline";
import { errorResponse } from "@/lib/http/error";

export async function POST(request: Request) {
  try {
    const input = await request.json();
    const config = readAiConfig();

    if (config.AI_PROVIDER === "mock") {
      const result = runMockPipeline(input);
      return Response.json(
        { data: result, meta: { demo: true, persisted: false, provider: "mock" } },
        { headers: { "cache-control": "no-store" } },
      );
    }

    const result = await runDeepSeekPipeline(input, config);
    return Response.json(
      { data: result.data, meta: { demo: false, persisted: false, ...result.meta } },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) {
      return errorResponse(400, "INVALID_INPUT", "来源材料格式不正确。");
    }
    if (error instanceof AiPipelineError) {
      return errorResponse(error.httpStatus, error.code, error.publicMessage);
    }
    return errorResponse(500, "PIPELINE_PREVIEW_FAILED", "预览处理失败，请稍后重试。");
  }
}
