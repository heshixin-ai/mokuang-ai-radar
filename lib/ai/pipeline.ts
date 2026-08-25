import {
  pipelinePreviewInputSchema,
  pipelinePreviewOutputSchema,
  type PipelinePreviewInput,
  type PipelinePreviewOutput,
} from "../domain/event";
import type { AiConfig } from "./config";
import {
  extractionJsonSchema,
  extractionOutputSchema,
  mergingJsonSchema,
  mergingOutputSchema,
  type ExtractionCandidate,
  type ExtractionOutput,
  type MergingOutput,
} from "./contracts";
import {
  DeepSeekResponsesClient,
  type FetchImplementation,
  type ModelUsage,
  type ReasoningEffort,
  type StructuredModelRequest,
  type StructuredModelResult,
} from "./deepseek";
import { AiPipelineError, toAiPipelineError, type AiErrorCode } from "./errors";
import {
  buildStageInstructions,
  EXTRACTION_PROMPT,
  EXTRACTION_PROMPT_VERSION,
  MERGING_PROMPT,
  MERGING_PROMPT_VERSION,
  PROMPT_BUNDLE_VERSION,
} from "./prompts";

const highRiskEventTypes = new Set(["pricing", "policy", "funding"]);

type StageName = "P-01" | "P-02";

export type StageExecutionMeta = {
  stage: StageName;
  finalModelId: string;
  attempts: number;
  escalated: boolean;
  escalationReason: string | null;
  escalationFailed: boolean;
  escalationErrorCode: AiErrorCode | null;
  latencyMs: number;
  usage: ModelUsage;
};

export type PipelineExecutionMeta = {
  provider: "deepseek";
  primaryModel: string;
  escalationModel: string;
  escalated: boolean;
  attempts: number;
  latencyMs: number;
  usage: ModelUsage;
  stages: StageExecutionMeta[];
};

export type RealPipelineResult = {
  data: PipelinePreviewOutput;
  meta: PipelineExecutionMeta;
};

type RunOptions = {
  fetchImplementation?: FetchImplementation;
  now?: Date;
  sleep?: (milliseconds: number) => Promise<void>;
};

type StageRouteResult<T> = {
  value: T;
  primaryValue: T | null;
  meta: StageExecutionMeta;
};

export async function runDeepSeekPipeline(
  rawInput: PipelinePreviewInput,
  config: AiConfig,
  options: RunOptions = {},
): Promise<RealPipelineResult> {
  const input = pipelinePreviewInputSchema.parse(rawInput);
  const startedAt = Date.now();
  const client = new DeepSeekResponsesClient(config, options.fetchImplementation);
  const now = (options.now ?? new Date()).toISOString();
  const allowedSources = new Map(input.sourceDocuments.map((source) => [source.id, source]));

  const extractionInput = {
    runtime: {
      now,
      stage_prompt_version: EXTRACTION_PROMPT_VERSION,
      input_schema_version: "pipeline-preview.v1",
    },
    source_documents: input.sourceDocuments.map((source) => ({
      source_id: source.id,
      publisher: source.publisher,
      title: source.title,
      url: source.url,
      source_type: source.sourceType,
      published_at: source.publishedAt,
      body: source.body,
    })),
  };

  const extractionRoute = await executeStage({
    stage: "P-01",
    client,
    config,
    request: {
      model: config.AI_MODEL_PRIMARY,
      instructions: buildStageInstructions(EXTRACTION_PROMPT),
      input: extractionInput,
      schemaName: "mokuang_event_extraction",
      jsonSchema: extractionJsonSchema,
      outputSchema: extractionOutputSchema,
      reasoningEffort: "none",
    },
    escalationEffort: "high",
    shouldEscalate: (value) => extractionEscalationReason(value, config.AI_ESCALATION_CONFIDENCE),
    validate: (value) => validateExtractionReferences(value, allowedSources),
    sleep: options.sleep,
  });

  const extraction = applyExtractionSafetyPolicy(
    extractionRoute.value,
    extractionRoute.primaryValue,
    config.AI_ESCALATION_CONFIDENCE,
  );
  const stages: StageExecutionMeta[] = [extractionRoute.meta];

  let merging: MergingOutput | null = null;
  if (extraction.task_status === "ok" && extraction.candidates.length > 1) {
    const candidateIds = new Set(extraction.candidates.map((candidate) => candidate.candidate_id));
    const mergingRoute = await executeStage({
      stage: "P-02",
      client,
      config,
      request: {
        model: config.AI_MODEL_PRIMARY,
        instructions: buildStageInstructions(MERGING_PROMPT),
        input: {
          runtime: {
            now,
            stage_prompt_version: MERGING_PROMPT_VERSION,
            input_schema_version: "candidate-events.v1",
          },
          candidate_events: extraction.candidates,
          recent_existing_events: [],
        },
        schemaName: "mokuang_event_merging",
        jsonSchema: mergingJsonSchema,
        outputSchema: mergingOutputSchema,
        reasoningEffort: "low",
      },
      escalationEffort: "high",
      shouldEscalate: (value) => mergingEscalationReason(value, config.AI_ESCALATION_CONFIDENCE),
      validate: (value) => validateMergingReferences(value, candidateIds, allowedSources),
      sleep: options.sleep,
    });
    merging = applyMergingSafetyPolicy(mergingRoute.value, mergingRoute.primaryValue);
    stages.push(mergingRoute.meta);
  }

  const finalStage = stages.at(-1)!;
  const data = buildPreviewOutput(input, extraction, merging, finalStage.finalModelId);
  return {
    data,
    meta: {
      provider: "deepseek",
      primaryModel: config.AI_MODEL_PRIMARY,
      escalationModel: config.AI_MODEL_ESCALATION,
      escalated: stages.some((stage) => stage.escalated),
      attempts: stages.reduce((total, stage) => total + stage.attempts, 0),
      latencyMs: Date.now() - startedAt,
      usage: stages.reduce((usage, stage) => addUsage(usage, stage.usage), emptyUsage()),
      stages,
    },
  };
}

async function executeStage<T>({
  stage,
  client,
  config,
  request,
  escalationEffort,
  shouldEscalate,
  validate,
  sleep = defaultSleep,
}: {
  stage: StageName;
  client: DeepSeekResponsesClient;
  config: AiConfig;
  request: StructuredModelRequest<T>;
  escalationEffort: ReasoningEffort;
  shouldEscalate: (value: T) => string | null;
  validate: (value: T) => void;
  sleep?: (milliseconds: number) => Promise<void>;
}): Promise<StageRouteResult<T>> {
  const startedAt = Date.now();
  let attempts = 0;
  let usage = emptyUsage();
  let primaryValue: T | null = null;
  let primaryResult: StructuredModelResult<T> | null = null;
  let primaryError: AiPipelineError | null = null;

  try {
    const result = await callWithRetry(client, request, config.AI_MAX_RETRIES, validate, sleep);
    attempts += result.attempts;
    usage = addUsage(usage, result.usage);
    primaryResult = result.result;
    primaryValue = result.result.value;
  } catch (error) {
    primaryError = toAiPipelineError(error);
    attempts += attemptsFromError(error);
    usage = addUsage(usage, usageFromError(error));
    if (!primaryError.retryable) throw primaryError;
  }

  const escalationReason = primaryResult
    ? shouldEscalate(primaryResult.value)
    : `primary_failed:${primaryError?.code ?? "unknown"}`;

  if (!escalationReason || config.AI_MODEL_ESCALATION === request.model) {
    if (!primaryResult) throw primaryError!;
    return {
      value: primaryResult.value,
      primaryValue,
      meta: {
        stage,
        finalModelId: primaryResult.modelId,
        attempts,
        escalated: false,
        escalationReason: null,
        escalationFailed: false,
        escalationErrorCode: null,
        latencyMs: Date.now() - startedAt,
        usage,
      },
    };
  }

  const escalationRequest: StructuredModelRequest<T> = {
    ...request,
    model: config.AI_MODEL_ESCALATION,
    reasoningEffort: escalationEffort,
    retryFeedback: primaryError
      ? "主模型未能返回合规结构。请严格按 JSON Schema 输出，并只引用输入中的 source_id。"
      : `主模型结果触发复核条件：${escalationReason}。请独立复核输入，不要假设主模型结论正确。`,
  };

  try {
    const result = await callWithRetry(client, escalationRequest, config.AI_MAX_RETRIES, validate, sleep);
    attempts += result.attempts;
    usage = addUsage(usage, result.usage);
    return {
      value: result.result.value,
      primaryValue,
      meta: {
        stage,
        finalModelId: result.result.modelId,
        attempts,
        escalated: true,
        escalationReason,
        escalationFailed: false,
        escalationErrorCode: null,
        latencyMs: Date.now() - startedAt,
        usage,
      },
    };
  } catch (error) {
    const escalationError = toAiPipelineError(error);
    attempts += attemptsFromError(error);
    usage = addUsage(usage, usageFromError(error));
    if (!primaryResult) throw escalationError;
    return {
      value: primaryResult.value,
      primaryValue,
      meta: {
        stage,
        finalModelId: primaryResult.modelId,
        attempts,
        escalated: true,
        escalationReason,
        escalationFailed: true,
        escalationErrorCode: escalationError.code,
        latencyMs: Date.now() - startedAt,
        usage,
      },
    };
  }
}

async function callWithRetry<T>(
  client: DeepSeekResponsesClient,
  request: StructuredModelRequest<T>,
  maxRetries: number,
  validate: (value: T) => void,
  sleep: (milliseconds: number) => Promise<void>,
): Promise<{ result: StructuredModelResult<T>; attempts: number; usage: ModelUsage }> {
  let lastError: AiPipelineError | null = null;
  let usage = emptyUsage();
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const result = await client.generateStructured({
        ...request,
        retryFeedback: attempt === 0
          ? request.retryFeedback
          : "上次输出未通过解析、Schema 或来源引用校验。请只输出合法 JSON，逐项满足 Schema，并只引用输入 source_id。",
      });
      usage = addUsage(usage, result.usage);
      validate(result.value);
      return { result, attempts: attempt + 1, usage };
    } catch (error) {
      lastError = toAiPipelineError(error);
      usage = addUsage(usage, usageFromError(lastError));
      lastError.usage = usage;
      Object.defineProperty(lastError, "attempts", { value: attempt + 1, configurable: true });
      if (process.env.NODE_ENV !== "test") {
        console.warn("[mokuang-ai] model attempt failed", {
          model: request.model,
          attempt: attempt + 1,
          code: lastError.code,
          detail: lastError.message,
        });
      }
      if (!lastError.retryable || attempt >= maxRetries) throw lastError;
      await sleep(150 * (2 ** attempt));
    }
  }
  throw lastError!;
}

export function validateExtractionReferences(
  value: ExtractionOutput,
  allowedSources: Map<string, PipelinePreviewInput["sourceDocuments"][number]>,
): void {
  for (const candidate of value.candidates) {
    if (!allowedSources.has(candidate.source_id)) {
      throw new AiPipelineError("MODEL_REFERENCE_INVALID", { retryable: true });
    }
    for (const evidence of candidate.evidence_spans) {
      const source = allowedSources.get(evidence.source_id);
      if (!source) throw new AiPipelineError("MODEL_REFERENCE_INVALID", { retryable: true });
      const haystack = normalizeEvidenceText(`${source.title}\n${source.body}`);
      const needle = normalizeEvidenceText(evidence.quote);
      if (!needle || !haystack.includes(needle)) {
        throw new AiPipelineError("MODEL_REFERENCE_INVALID", {
          retryable: true,
          internalMessage: "Evidence quote was not found in its source document",
        });
      }
    }
  }
}

function validateMergingReferences(
  value: MergingOutput,
  candidateIds: Set<string>,
  allowedSources: Map<string, PipelinePreviewInput["sourceDocuments"][number]>,
): void {
  for (const decision of value.decisions) {
    if (!candidateIds.has(decision.candidate_id)) {
      throw new AiPipelineError("MODEL_REFERENCE_INVALID", { retryable: true });
    }
    if (decision.matched_source_ids.some((sourceId) => !allowedSources.has(sourceId))) {
      throw new AiPipelineError("MODEL_REFERENCE_INVALID", { retryable: true });
    }
    if (decision.action === "merge_into") {
      throw new AiPipelineError("MODEL_REFERENCE_INVALID", {
        retryable: true,
        internalMessage: "No existing events were supplied, so merge_into is not allowed",
      });
    }
  }
}

function extractionEscalationReason(value: ExtractionOutput, threshold: number): string | null {
  if (value.task_status !== "ok") return null;
  if (value.candidates.some((candidate) => highRiskEventTypes.has(candidate.event_type))) return "high_risk_event_type";
  if (value.candidates.some((candidate) => candidate.confidence < threshold)) return "low_confidence";
  if (value.candidates.some((candidate) => candidate.needs_review && !candidate.injection_suspected)) return "model_requested_review";
  return null;
}

function mergingEscalationReason(value: MergingOutput, threshold: number): string | null {
  if (value.task_status !== "ok") return null;
  if (value.decisions.some((decision) => decision.conflict)) return "source_conflict";
  if (value.decisions.some((decision) => decision.confidence < threshold)) return "low_confidence";
  if (value.decisions.some((decision) => decision.needs_review || decision.action === "manual_review")) return "model_requested_review";
  return null;
}

function applyExtractionSafetyPolicy(
  finalValue: ExtractionOutput,
  primaryValue: ExtractionOutput | null,
  threshold: number,
): ExtractionOutput {
  const primaryHadHighRisk = primaryValue?.candidates.some((candidate) => highRiskEventTypes.has(candidate.event_type)) ?? false;
  const primaryHadInjection = primaryValue?.candidates.some((candidate) => candidate.injection_suspected) ?? false;
  const primaryWasLowConfidence = primaryValue?.candidates.some((candidate) => candidate.confidence < threshold) ?? false;

  return {
    ...finalValue,
    candidates: finalValue.candidates.map((candidate) => {
      const reasons = new Set(candidate.review_reasons);
      if (highRiskEventTypes.has(candidate.event_type) || primaryHadHighRisk) reasons.add("high_risk_event_type");
      if (candidate.injection_suspected || primaryHadInjection) reasons.add("prompt_injection_suspected");
      if (primaryWasLowConfidence) reasons.add("primary_low_confidence");
      return {
        ...candidate,
        needs_review: candidate.needs_review || reasons.size > 0,
        review_reasons: [...reasons],
      };
    }),
  };
}

function applyMergingSafetyPolicy(finalValue: MergingOutput, primaryValue: MergingOutput | null): MergingOutput {
  const primaryHadConflict = primaryValue?.decisions.some((decision) => decision.conflict) ?? false;
  return {
    ...finalValue,
    decisions: finalValue.decisions.map((decision) => {
      const reasons = new Set(decision.review_reasons);
      if (decision.conflict || primaryHadConflict) reasons.add("source_conflict");
      return {
        ...decision,
        conflict: decision.conflict || primaryHadConflict,
        needs_review: decision.needs_review || decision.action === "manual_review" || reasons.size > 0,
        review_reasons: [...reasons],
      };
    }),
  };
}

function buildPreviewOutput(
  input: PipelinePreviewInput,
  extraction: ExtractionOutput,
  merging: MergingOutput | null,
  modelId: string,
): PipelinePreviewOutput {
  if (extraction.task_status !== "ok" || extraction.candidates.length === 0) {
    return pipelinePreviewOutputSchema.parse({
      taskStatus: extraction.task_status,
      eventType: null,
      titleZh: null,
      whatChanged: null,
      evidenceLevel: null,
      sourceIds: input.sourceDocuments.map((source) => source.id),
      confidence: extraction.task_status === "irrelevant" ? 0.9 : 0.2,
      needsReview: extraction.task_status === "insufficient_input",
      reviewReasons: extraction.task_status === "insufficient_input" ? ["insufficient_input"] : [],
      promptVersion: PROMPT_BUNDLE_VERSION,
      modelId,
    });
  }

  const candidate = [...extraction.candidates].sort((left, right) => right.confidence - left.confidence)[0];
  const decision = merging?.decisions.find((item) => item.candidate_id === candidate.candidate_id) ?? null;
  const relatedDecisions = decision
    ? merging!.decisions.filter((item) => item.canonical_change_key === decision.canonical_change_key)
    : [];
  const sourceIds = new Set<string>([
    candidate.source_id,
    ...candidate.evidence_spans.map((evidence) => evidence.source_id),
    ...relatedDecisions.flatMap((item) => item.matched_source_ids),
  ]);
  const reviewReasons = new Set([
    ...candidate.review_reasons,
    ...(decision?.review_reasons ?? []),
  ]);
  if (merging && new Set(merging.decisions.map((item) => item.canonical_change_key)).size > 1) {
    reviewReasons.add("multiple_distinct_events_in_preview");
  }

  return pipelinePreviewOutputSchema.parse({
    taskStatus: "ok",
    eventType: candidate.event_type,
    titleZh: `${candidate.subject.name}｜${candidate.change_statement}`,
    whatChanged: candidate.change_statement,
    evidenceLevel: decision?.evidence_level ?? candidate.evidence_level,
    sourceIds: [...sourceIds],
    confidence: Math.min(candidate.confidence, decision?.confidence ?? 1),
    needsReview: candidate.needs_review || Boolean(decision?.needs_review) || reviewReasons.size > 0,
    reviewReasons: [...reviewReasons],
    promptVersion: PROMPT_BUNDLE_VERSION,
    modelId,
  });
}

function normalizeEvidenceText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function emptyUsage(): ModelUsage {
  return { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 };
}

function addUsage(left: ModelUsage, right: ModelUsage): ModelUsage {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    cachedInputTokens: left.cachedInputTokens + right.cachedInputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    reasoningTokens: left.reasoningTokens + right.reasoningTokens,
    totalTokens: left.totalTokens + right.totalTokens,
  };
}

function attemptsFromError(error: unknown): number {
  if (typeof error === "object" && error !== null && "attempts" in error) {
    const attempts = (error as { attempts?: unknown }).attempts;
    if (typeof attempts === "number") return attempts;
  }
  return 1;
}

function usageFromError(error: unknown): ModelUsage {
  if (error instanceof AiPipelineError && error.usage) return error.usage;
  return emptyUsage();
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function isHighRiskCandidate(candidate: ExtractionCandidate): boolean {
  return highRiskEventTypes.has(candidate.event_type);
}
