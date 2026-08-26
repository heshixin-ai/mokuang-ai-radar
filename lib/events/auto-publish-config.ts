import { z } from "zod";

const autoPublishEnvironmentSchema = z.object({
  AUTO_PUBLISH_MODE: z.enum(["off", "safe"]).default("off"),
  AUTO_PUBLISH_MIN_CONFIDENCE: z.coerce.number().min(0.8).max(1).default(0.8),
  AUTO_PUBLISH_BATCH_SIZE: z.coerce.number().int().min(1).max(10).default(1),
});

export type AutoPublishConfig = z.infer<typeof autoPublishEnvironmentSchema>;

export function readAutoPublishConfig(
  environment: Record<string, string | undefined> = process.env,
): AutoPublishConfig {
  return autoPublishEnvironmentSchema.parse(environment);
}
