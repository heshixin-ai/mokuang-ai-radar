import { z } from "zod";

const schedulerEnvironmentSchema = z.object({
  INGESTION_SOURCE_BATCH_SIZE: z.coerce.number().int().min(1).max(20).default(20),
  INGESTION_SOURCE_CONCURRENCY: z.coerce.number().int().min(1).max(5).default(3),
  INGESTION_MAX_ITEMS_PER_SOURCE: z.coerce.number().int().min(1).max(50).default(10),
  INGESTION_ANALYSIS_BATCH_SIZE: z.coerce.number().int().min(0).max(10).default(3),
  INGESTION_ANALYSIS_MODE: z.enum(["auto", "off"]).default("auto"),
});

export type IngestionSchedulerConfig = z.infer<typeof schedulerEnvironmentSchema>;

export function readIngestionSchedulerConfig(
  environment: Record<string, string | undefined> = process.env,
): IngestionSchedulerConfig {
  return schedulerEnvironmentSchema.parse(environment);
}
