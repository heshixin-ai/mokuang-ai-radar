import type { AiConfig } from "@/lib/ai/config";
import type { IngestionRepository, ReviewActor } from "@/lib/repository/ingestion-contract";
import { analyzeSourceDocument, IngestionServiceError, runSourceIngestion } from "./service";
import { curatedSources } from "./sources";
import type { NormalizedFeedItem, SourceDefinition } from "./types";
import type { IngestionSchedulerConfig } from "./scheduler-config";

const schedulerActor: ReviewActor = {
  id: "system-scheduler",
  email: "scheduler@mokuang.internal",
  displayName: "墨况定时采集",
};

export type ScheduledRefreshSummary = {
  scheduledAt: string;
  sourcesEligible: number;
  sourcesAttempted: number;
  sourcesSucceeded: number;
  sourcesFailed: number;
  sourcesSkipped: number;
  discoveredCount: number;
  insertedCount: number;
  duplicateCount: number;
  analysisEnabled: boolean;
  analysesAttempted: number;
  candidatesCreated: number;
  irrelevantCount: number;
  analysesFailed: number;
};

export async function runScheduledRefresh(options: {
  repository: IngestionRepository;
  aiConfig: AiConfig;
  schedulerConfig: IngestionSchedulerConfig;
  actor?: ReviewActor;
  clock?: () => Date;
  idFactory?: () => string;
  fetchFeed?: (source: SourceDefinition) => Promise<NormalizedFeedItem[]>;
  analysisEnabled?: boolean;
}): Promise<ScheduledRefreshSummary> {
  const actor = options.actor ?? schedulerActor;
  const clock = options.clock ?? (() => new Date());
  const scheduledAt = clock().toISOString();
  await options.repository.syncSources(curatedSources, scheduledAt);
  const dueSources = await options.repository.listDueSources(
    scheduledAt,
    options.schedulerConfig.INGESTION_SOURCE_BATCH_SIZE,
  );

  const sourceResults = await mapInBatches(
    dueSources,
    options.schedulerConfig.INGESTION_SOURCE_CONCURRENCY,
    async (source) => {
      try {
        const result = await runSourceIngestion(source.id, actor, {
          repository: options.repository,
          fetchFeed: options.fetchFeed,
          clock,
          idFactory: options.idFactory,
          triggerKind: "scheduled",
          syncSources: false,
          maxItems: options.schedulerConfig.INGESTION_MAX_ITEMS_PER_SOURCE,
        });
        return { status: "succeeded" as const, result };
      } catch (error) {
        if (error instanceof IngestionServiceError && error.code === "SOURCE_RUN_CONFLICT") {
          return { status: "skipped" as const };
        }
        return { status: "failed" as const };
      }
    },
  );

  const analysisEnabled = options.analysisEnabled
    ?? (options.schedulerConfig.INGESTION_ANALYSIS_MODE === "auto" && options.aiConfig.AI_PROVIDER !== "mock");
  let analysesAttempted = 0;
  let candidatesCreated = 0;
  let irrelevantCount = 0;
  let analysesFailed = 0;

  if (analysisEnabled && options.schedulerConfig.INGESTION_ANALYSIS_BATCH_SIZE > 0) {
    const documentIds = await options.repository.listPendingDocumentIds(
      options.schedulerConfig.INGESTION_ANALYSIS_BATCH_SIZE,
    );
    for (const documentId of documentIds) {
      analysesAttempted += 1;
      try {
        const result = await analyzeSourceDocument(documentId, {
          repository: options.repository,
          config: options.aiConfig,
          clock,
        });
        if (result.status === "candidate_created") candidatesCreated += 1;
        else irrelevantCount += 1;
      } catch {
        analysesFailed += 1;
      }
    }
  }

  const succeeded = sourceResults.filter((result) => result.status === "succeeded");
  return {
    scheduledAt,
    sourcesEligible: dueSources.length,
    sourcesAttempted: sourceResults.filter((result) => result.status !== "skipped").length,
    sourcesSucceeded: succeeded.length,
    sourcesFailed: sourceResults.filter((result) => result.status === "failed").length,
    sourcesSkipped: sourceResults.filter((result) => result.status === "skipped").length,
    discoveredCount: succeeded.reduce((sum, item) => sum + item.result.discoveredCount, 0),
    insertedCount: succeeded.reduce((sum, item) => sum + item.result.insertedCount, 0),
    duplicateCount: succeeded.reduce((sum, item) => sum + item.result.duplicateCount, 0),
    analysisEnabled,
    analysesAttempted,
    candidatesCreated,
    irrelevantCount,
    analysesFailed,
  };
}

async function mapInBatches<T, R>(
  values: T[],
  concurrency: number,
  operation: (value: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let index = 0; index < values.length; index += concurrency) {
    results.push(...await Promise.all(values.slice(index, index + concurrency).map(operation)));
  }
  return results;
}
