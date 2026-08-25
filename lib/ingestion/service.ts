import { ZodError } from "zod";
import { readAiConfig, type AiConfig } from "@/lib/ai/config";
import { AiPipelineError } from "@/lib/ai/errors";
import { runMockPipeline } from "@/lib/ai/mock-pipeline";
import { runDeepSeekPipeline } from "@/lib/ai/pipeline";
import type { PipelinePreviewOutput } from "@/lib/domain/event";
import type { AnalysisExecutionMeta, IngestionRepository, ReviewAction, ReviewActor } from "@/lib/repository/ingestion-contract";
import { FeedIngestionError, fetchAndParseFeed, stableDocumentId } from "./feed";
import { curatedSources, getCuratedSource } from "./sources";
import type { DashboardData, NormalizedFeedItem, SourceDefinition } from "./types";

export class IngestionServiceError extends Error {
  constructor(
    public readonly code: string,
    public readonly httpStatus: number,
    public readonly publicMessage: string,
  ) {
    super(code);
    this.name = "IngestionServiceError";
  }
}

type Clock = () => Date;

export async function getReviewDashboard(
  repository?: IngestionRepository,
  clock: Clock = () => new Date(),
): Promise<DashboardData> {
  const resolvedRepository = repository ?? await defaultRepository();
  await resolvedRepository.syncSources(curatedSources, clock().toISOString());
  return resolvedRepository.getDashboard();
}

export async function runSourceIngestion(
  sourceId: string,
  actor: ReviewActor,
  options: {
    repository?: IngestionRepository;
    fetchFeed?: (source: SourceDefinition) => Promise<NormalizedFeedItem[]>;
    clock?: Clock;
    idFactory?: () => string;
  } = {},
): Promise<{ runId: string; discoveredCount: number; insertedCount: number; duplicateCount: number }> {
  const source = getCuratedSource(sourceId);
  if (!source || source.status !== "active" || source.authorizationStatus !== "approved") {
    throw new IngestionServiceError("SOURCE_NOT_ALLOWED", 400, "该来源未启用或尚未完成授权登记。");
  }

  const repository = options.repository ?? await defaultRepository();
  const clock = options.clock ?? (() => new Date());
  const idFactory = options.idFactory ?? (() => crypto.randomUUID());
  const startedAt = clock().toISOString();
  const runId = `run_${idFactory()}`;
  await repository.syncSources(curatedSources, startedAt);
  await repository.createRun({ id: runId, sourceId, triggeredBy: actor.email, startedAt });

  try {
    const items = await (options.fetchFeed ?? fetchAndParseFeed)(source);
    let insertedCount = 0;
    for (const item of items) {
      const inserted = await repository.insertDocument({
        id: await stableDocumentId(source.id, item.externalId),
        sourceId: source.id,
        item,
        discoveredAt: clock().toISOString(),
      });
      if (inserted) insertedCount += 1;
    }
    const completedAt = clock().toISOString();
    const result = {
      runId,
      discoveredCount: items.length,
      insertedCount,
      duplicateCount: items.length - insertedCount,
    };
    await repository.finishRun({ id: runId, completedAt, ...result });
    return result;
  } catch (error) {
    const errorCode = error instanceof FeedIngestionError ? error.code : "INGESTION_FAILED";
    await repository.failRun({
      id: runId,
      sourceId,
      completedAt: clock().toISOString(),
      errorCode,
    });
    if (error instanceof FeedIngestionError) {
      throw new IngestionServiceError(error.code, 502, "来源暂时无法采集，已记录失败状态。");
    }
    throw new IngestionServiceError("INGESTION_FAILED", 500, "采集失败，已保留运行记录。");
  }
}

export async function analyzeSourceDocument(
  documentId: string,
  options: {
    repository?: IngestionRepository;
    config?: AiConfig;
    clock?: Clock;
  } = {},
): Promise<{
  status: "candidate_created" | "irrelevant";
  candidateId: string | null;
  output: PipelinePreviewOutput;
  analysisMeta: AnalysisExecutionMeta;
}> {
  const repository = options.repository ?? await defaultRepository();
  const clock = options.clock ?? (() => new Date());
  const started = clock();
  const staleBefore = new Date(started.getTime() - 10 * 60 * 1_000).toISOString();
  const document = await repository.claimDocument(documentId, started.toISOString(), staleBefore);
  if (!document) {
    throw new IngestionServiceError("DOCUMENT_NOT_READY", 409, "这条内容已在处理或已经完成分析。");
  }

  const source = getCuratedSource(document.sourceId);
  if (!source) {
    await repository.failAnalysis(documentId, clock().toISOString(), "SOURCE_NOT_ALLOWED");
    throw new IngestionServiceError("SOURCE_NOT_ALLOWED", 400, "该来源不在受控来源列表中。");
  }

  try {
    const config = options.config ?? readAiConfig();
    const input = {
      sourceDocuments: [{
        id: document.id,
        publisher: source.name,
        title: document.title,
        url: document.canonicalUrl,
        sourceType: source.sourceType,
        publishedAt: new Date(document.publishedAt).toISOString(),
        body: document.contentExcerpt,
      }],
    };
    const modelStartedAt = Date.now();
    const modelResult = config.AI_PROVIDER === "mock"
      ? {
          data: runMockPipeline(input),
          meta: {
            provider: "mock" as const,
            escalated: false,
            attempts: 1,
            latencyMs: Date.now() - modelStartedAt,
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, reasoningTokens: 0 },
          },
        }
      : await runDeepSeekPipeline(input, config);
    const output = modelResult.data;
    const analysisMeta: AnalysisExecutionMeta = {
      provider: modelResult.meta.provider,
      escalated: modelResult.meta.escalated,
      attempts: modelResult.meta.attempts,
      latencyMs: modelResult.meta.latencyMs,
      usage: modelResult.meta.usage,
    };
    const analyzedAt = clock().toISOString();

    if (output.taskStatus === "irrelevant") {
      await repository.completeIrrelevant(documentId, analyzedAt);
      return { status: "irrelevant", candidateId: null, output, analysisMeta };
    }
    if (output.taskStatus !== "ok") {
      throw new IngestionServiceError("ANALYSIS_INSUFFICIENT", 422, "模型没有获得足够信息，内容已保留以便重试。");
    }

    const candidateId = `cand_${document.id.replace(/^doc_/, "")}`;
    await repository.completeCandidate({ documentId, candidateId, output, analysisMeta, analyzedAt });
    return { status: "candidate_created", candidateId, output, analysisMeta };
  } catch (error) {
    const errorCode = analysisErrorCode(error);
    await repository.failAnalysis(documentId, clock().toISOString(), errorCode);
    if (error instanceof IngestionServiceError) throw error;
    if (error instanceof AiPipelineError) {
      throw new IngestionServiceError(error.code, error.httpStatus, error.publicMessage);
    }
    if (error instanceof ZodError) {
      throw new IngestionServiceError("ANALYSIS_OUTPUT_INVALID", 502, "模型输出未通过结构校验，内容已保留。");
    }
    throw new IngestionServiceError("ANALYSIS_FAILED", 500, "分析失败，内容已保留以便重试。");
  }
}

export async function reviewEventCandidate(
  candidateId: string,
  action: ReviewAction,
  note: string | null,
  actor: ReviewActor,
  options: {
    repository?: IngestionRepository;
    clock?: Clock;
    idFactory?: () => string;
  } = {},
) {
  const repository = options.repository ?? await defaultRepository();
  const reviewedAt = (options.clock ?? (() => new Date()))().toISOString();
  const candidate = await repository.reviewCandidate({
    candidateId,
    action,
    note,
    actor,
    reviewedAt,
    actionId: `rev_${(options.idFactory ?? (() => crypto.randomUUID()))()}`,
  });
  if (!candidate) {
    throw new IngestionServiceError("REVIEW_STATE_CONFLICT", 409, "候选状态已经变化，请刷新后再操作。");
  }
  return candidate;
}

function analysisErrorCode(error: unknown): string {
  if (error instanceof IngestionServiceError || error instanceof AiPipelineError) return error.code;
  if (error instanceof ZodError) return "ANALYSIS_OUTPUT_INVALID";
  return "ANALYSIS_FAILED";
}

async function defaultRepository(): Promise<IngestionRepository> {
  const { createD1IngestionRepository } = await import("@/lib/repository/ingestion");
  return createD1IngestionRepository();
}
