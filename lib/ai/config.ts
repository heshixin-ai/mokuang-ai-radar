import { z } from "zod";
import { AiPipelineError } from "./errors";

const optionalSecret = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().min(1).optional(),
);

const aiEnvironmentSchema = z.object({
  AI_PROVIDER: z.enum(["mock", "deepseek"]).default("mock"),
  AI_BASE_URL: z.string().url().default("https://api.deepseek.com"),
  AI_MODEL_PRIMARY: z.string().min(1).default("deepseek-v4-flash"),
  AI_MODEL_ESCALATION: z.string().min(1).default("deepseek-v4-pro"),
  AI_API_KEY: optionalSecret,
  AI_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(30_000),
  AI_MAX_RETRIES: z.coerce.number().int().min(0).max(2).default(1),
  AI_ESCALATION_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.8),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(512).max(65_536).default(8_192),
});

export type AiConfig = z.infer<typeof aiEnvironmentSchema> & {
  AI_API_KEY?: string;
};

export function readAiConfig(
  environment: Record<string, string | undefined> = process.env,
): AiConfig {
  const parsed = aiEnvironmentSchema.safeParse(environment);
  if (!parsed.success) {
    throw new AiPipelineError("AI_CONFIG_INVALID", {
      httpStatus: 503,
      internalMessage: "AI environment variables failed validation",
    });
  }

  if (parsed.data.AI_PROVIDER === "deepseek" && !parsed.data.AI_API_KEY) {
    throw new AiPipelineError("AI_CONFIG_INVALID", {
      httpStatus: 503,
      internalMessage: "AI_API_KEY is required for the DeepSeek provider",
    });
  }

  return parsed.data;
}
