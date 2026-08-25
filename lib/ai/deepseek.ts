import { z } from "zod";
import type { AiConfig } from "./config";
import { AiPipelineError } from "./errors";

const deepSeekResponseSchema = z.object({
  status: z.enum(["in_progress", "completed", "incomplete", "failed"]),
  model: z.string().min(1),
  output_text: z.string().optional(),
  output: z.array(z.object({
    type: z.string(),
    content: z.array(z.object({
      type: z.string(),
      text: z.string().optional(),
    }).passthrough()).optional(),
  }).passthrough()),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    input_tokens_details: z.object({
      cached_tokens: z.number().int().nonnegative().default(0),
    }).passthrough().optional(),
    output_tokens: z.number().int().nonnegative(),
    output_tokens_details: z.object({
      reasoning_tokens: z.number().int().nonnegative().default(0),
    }).passthrough().optional(),
    total_tokens: z.number().int().nonnegative(),
  }).passthrough(),
}).passthrough();

export type ReasoningEffort = "none" | "low" | "high" | "max";

export type ModelUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
};

export type StructuredModelResult<T> = {
  value: T;
  modelId: string;
  latencyMs: number;
  usage: ModelUsage;
};

export type StructuredModelRequest<T> = {
  model: string;
  instructions: string;
  input: unknown;
  schemaName: string;
  jsonSchema: object;
  outputSchema: z.ZodType<T>;
  reasoningEffort: ReasoningEffort;
  retryFeedback?: string;
};

export type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export class DeepSeekResponsesClient {
  private readonly fetchImplementation: FetchImplementation;

  constructor(
    private readonly config: AiConfig,
    fetchImplementation: FetchImplementation = (input, init) => fetch(input, init),
  ) {
    this.fetchImplementation = fetchImplementation;
  }

  async generateStructured<T>(request: StructuredModelRequest<T>): Promise<StructuredModelResult<T>> {
    if (!this.config.AI_API_KEY) {
      throw new AiPipelineError("AI_CONFIG_INVALID", { httpStatus: 503 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.AI_TIMEOUT_MS);
    const startedAt = Date.now();

    try {
      const input = request.retryFeedback
        ? { ...asObject(request.input), runtime_retry_feedback: request.retryFeedback }
        : request.input;
      const response = await this.fetchImplementation(
        `${this.config.AI_BASE_URL.replace(/\/+$/, "")}/responses`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${this.config.AI_API_KEY}`,
          },
          body: JSON.stringify({
            model: request.model,
            instructions: request.instructions,
            input: JSON.stringify(input),
            reasoning: { effort: request.reasoningEffort },
            max_output_tokens: this.config.AI_MAX_OUTPUT_TOKENS,
            ...(request.reasoningEffort === "none" ? { temperature: 0.1 } : {}),
            text: {
              format: {
                type: "json_schema",
                name: request.schemaName,
                schema: request.jsonSchema,
              },
            },
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) throw mapHttpError(response.status);

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new AiPipelineError("MODEL_RESPONSE_INVALID", {
          retryable: true,
          internalMessage: "DeepSeek response body was not JSON",
        });
      }

      const parsedResponse = deepSeekResponseSchema.safeParse(payload);
      if (!parsedResponse.success) {
        throw new AiPipelineError("MODEL_RESPONSE_INVALID", {
          retryable: true,
          internalMessage: "DeepSeek response envelope was invalid",
        });
      }
      const usage = toModelUsage(parsedResponse.data.usage);
      if (parsedResponse.data.status !== "completed") {
        throw new AiPipelineError("MODEL_RESPONSE_INVALID", {
          retryable: true,
          internalMessage: "DeepSeek response was incomplete",
          usage,
        });
      }

      const outputText = extractOutputText(parsedResponse.data);
      if (!outputText) {
        throw new AiPipelineError("MODEL_RESPONSE_INVALID", {
          retryable: true,
          internalMessage: "DeepSeek response did not contain output_text",
          usage,
        });
      }

      let jsonValue: unknown;
      try {
        jsonValue = parseModelJson(outputText);
      } catch (error) {
        if (error instanceof AiPipelineError) error.usage = usage;
        throw error;
      }
      const structuredValue = request.outputSchema.safeParse(jsonValue);
      if (!structuredValue.success) {
        const paths = structuredValue.error.issues.slice(0, 5).map((issue) => issue.path.join(".")).join(",");
        throw new AiPipelineError("MODEL_RESPONSE_INVALID", {
          retryable: true,
          internalMessage: `Structured output validation failed at: ${paths || "root"}`,
          usage,
        });
      }

      return {
        value: structuredValue.data,
        modelId: parsedResponse.data.model,
        latencyMs: Date.now() - startedAt,
        usage,
      };
    } catch (error) {
      if (isAbortError(error)) {
        throw new AiPipelineError("MODEL_TIMEOUT", {
          httpStatus: 504,
          retryable: true,
          internalMessage: "DeepSeek request timed out",
        });
      }
      if (error instanceof AiPipelineError) throw error;
      throw new AiPipelineError("MODEL_UPSTREAM_FAILED", {
        retryable: true,
        internalMessage: error instanceof Error ? error.message : "DeepSeek request failed",
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function extractOutputText(payload: z.infer<typeof deepSeekResponseSchema>): string | null {
  if (payload.output_text?.trim()) return payload.output_text.trim();
  const parts = payload.output.flatMap((item) =>
    item.type === "message"
      ? (item.content ?? [])
        .filter((content) => content.type === "output_text" && content.text)
        .map((content) => content.text!)
      : [],
  );
  const text = parts.join("").trim();
  return text || null;
}

function parseModelJson(text: string): unknown {
  const trimmed = text.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    return JSON.parse(withoutFence);
  } catch {
    const start = withoutFence.indexOf("{");
    const end = withoutFence.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(withoutFence.slice(start, end + 1));
      } catch {
        // Fall through to the controlled error below.
      }
    }
    throw new AiPipelineError("MODEL_RESPONSE_INVALID", {
      retryable: true,
      internalMessage: "Structured output was not valid JSON",
    });
  }
}

function mapHttpError(status: number): AiPipelineError {
  if (status === 401 || status === 403) {
    return new AiPipelineError("MODEL_AUTH_FAILED", { httpStatus: 502 });
  }
  if (status === 429) {
    return new AiPipelineError("MODEL_RATE_LIMITED", { httpStatus: 503, retryable: true });
  }
  return new AiPipelineError("MODEL_UPSTREAM_FAILED", {
    httpStatus: status >= 500 ? 502 : 400,
    retryable: status >= 500,
    internalMessage: `DeepSeek returned HTTP ${status}`,
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : { input: value };
}

function toModelUsage(usage: z.infer<typeof deepSeekResponseSchema>["usage"]): ModelUsage {
  return {
    inputTokens: usage.input_tokens,
    cachedInputTokens: usage.input_tokens_details?.cached_tokens ?? 0,
    outputTokens: usage.output_tokens,
    reasoningTokens: usage.output_tokens_details?.reasoning_tokens ?? 0,
    totalTokens: usage.total_tokens,
  };
}
