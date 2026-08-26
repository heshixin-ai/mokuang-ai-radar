import { z } from "zod";

const schedulerEnvironmentSchema = z.object({
  INGESTION_SOURCE_BATCH_SIZE: z.coerce.number().int().min(1).max(20).default(20),
  INGESTION_SOURCE_CONCURRENCY: z.coerce.number().int().min(1).max(5).default(3),
  INGESTION_MAX_ITEMS_PER_SOURCE: z.coerce.number().int().min(1).max(50).default(10),
  INGESTION_ANALYSIS_BATCH_SIZE: z.coerce.number().int().min(0).max(10).default(3),
  INGESTION_ANALYSIS_MODE: z.enum(["auto", "off"]).default("auto"),
});

export type IngestionSchedulerConfig = z.infer<typeof schedulerEnvironmentSchema>;

const externalRefreshEnvironmentSchema = z.object({
  EXTERNAL_REFRESH_SOURCE_BATCH_SIZE: z.coerce.number().int().min(1).max(5).default(4),
  EXTERNAL_REFRESH_SOURCE_CONCURRENCY: z.coerce.number().int().min(1).max(3).default(2),
  EXTERNAL_REFRESH_ANALYSIS_BATCH_SIZE: z.coerce.number().int().min(0).max(3).default(1),
});

export function readIngestionSchedulerConfig(
  environment: Record<string, string | undefined> = process.env,
): IngestionSchedulerConfig {
  return schedulerEnvironmentSchema.parse(environment);
}

export function readExternalRefreshSchedulerConfig(
  environment: Record<string, string | undefined> = process.env,
): IngestionSchedulerConfig {
  const base = readIngestionSchedulerConfig(environment);
  const external = externalRefreshEnvironmentSchema.parse(environment);
  const sourceBatchSize = Math.min(
    base.INGESTION_SOURCE_BATCH_SIZE,
    external.EXTERNAL_REFRESH_SOURCE_BATCH_SIZE,
  );

  return {
    ...base,
    INGESTION_SOURCE_BATCH_SIZE: sourceBatchSize,
    INGESTION_SOURCE_CONCURRENCY: Math.min(
      sourceBatchSize,
      base.INGESTION_SOURCE_CONCURRENCY,
      external.EXTERNAL_REFRESH_SOURCE_CONCURRENCY,
    ),
    INGESTION_ANALYSIS_BATCH_SIZE: Math.min(
      base.INGESTION_ANALYSIS_BATCH_SIZE,
      external.EXTERNAL_REFRESH_ANALYSIS_BATCH_SIZE,
    ),
  };
}
