export type AiErrorCode =
  | "AI_CONFIG_INVALID"
  | "MODEL_AUTH_FAILED"
  | "MODEL_RATE_LIMITED"
  | "MODEL_TIMEOUT"
  | "MODEL_UPSTREAM_FAILED"
  | "MODEL_RESPONSE_INVALID"
  | "MODEL_REFERENCE_INVALID";

export type AiUsageSnapshot = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
};

const publicMessages: Record<AiErrorCode, string> = {
  AI_CONFIG_INVALID: "模型服务配置不完整。",
  MODEL_AUTH_FAILED: "模型服务认证失败，请检查服务端配置。",
  MODEL_RATE_LIMITED: "模型服务当前繁忙，请稍后重试。",
  MODEL_TIMEOUT: "模型处理超时，请稍后重试。",
  MODEL_UPSTREAM_FAILED: "模型服务暂时不可用，请稍后重试。",
  MODEL_RESPONSE_INVALID: "模型返回的数据不符合要求，已停止处理。",
  MODEL_REFERENCE_INVALID: "模型返回了无法追溯的来源引用，已停止处理。",
};

export class AiPipelineError extends Error {
  readonly code: AiErrorCode;
  readonly httpStatus: number;
  readonly retryable: boolean;
  usage: AiUsageSnapshot | null;

  constructor(
    code: AiErrorCode,
    options: {
      httpStatus?: number;
      retryable?: boolean;
      internalMessage?: string;
      usage?: AiUsageSnapshot | null;
    } = {},
  ) {
    super(options.internalMessage ?? publicMessages[code]);
    this.name = "AiPipelineError";
    this.code = code;
    this.httpStatus = options.httpStatus ?? 502;
    this.retryable = options.retryable ?? false;
    this.usage = options.usage ?? null;
  }

  get publicMessage(): string {
    return publicMessages[this.code];
  }
}

export function toAiPipelineError(error: unknown): AiPipelineError {
  if (error instanceof AiPipelineError) return error;
  return new AiPipelineError("MODEL_UPSTREAM_FAILED", {
    retryable: true,
    internalMessage: error instanceof Error ? error.message : "Unknown model error",
  });
}
