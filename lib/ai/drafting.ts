import type { AiConfig } from "@/lib/ai/config";
import {
  impactAnalysisJsonSchema,
  impactAnalysisOutputSchema,
  intelligenceDraftJsonSchema,
  intelligenceDraftOutputSchema,
  type ImpactAnalysisOutput,
  type IntelligenceDraftOutput,
} from "@/lib/ai/drafting-contracts";
import { DeepSeekResponsesClient, type FetchImplementation, type ModelUsage, type StructuredModelRequest } from "@/lib/ai/deepseek";
import { AiPipelineError, toAiPipelineError } from "@/lib/ai/errors";
import {
  buildStageInstructions,
  DRAFTING_PROMPT_BUNDLE_VERSION,
  IMPACT_PROMPT,
  IMPACT_PROMPT_VERSION,
  WRITING_PROMPT,
  WRITING_PROMPT_VERSION,
} from "@/lib/ai/prompts";
import type { ApprovedCandidateMaterial } from "@/lib/events/types";

export type DraftingResult = {
  impact: ImpactAnalysisOutput;
  draft: IntelligenceDraftOutput;
  promptVersion: string;
  modelId: string;
  meta: {
    provider: "mock" | "deepseek";
    attempts: number;
    latencyMs: number;
    usage: Omit<ModelUsage, "cachedInputTokens">;
  };
};

export async function generateEventDraft(
  material: ApprovedCandidateMaterial,
  config: AiConfig,
  options: { fetchImplementation?: FetchImplementation; now?: Date; sleep?: (milliseconds: number) => Promise<void> } = {},
): Promise<DraftingResult> {
  if (config.AI_PROVIDER === "mock") return mockDraft(material);

  const startedAt = Date.now();
  const client = new DeepSeekResponsesClient(config, options.fetchImplementation);
  const now = (options.now ?? new Date()).toISOString();
  const verifiedEvent = {
    event_id: eventIdForCandidate(material.candidate.id),
    event_type: material.candidate.eventType,
    title_zh: material.candidate.titleZh,
    what_changed: material.candidate.whatChanged,
    before: null,
    after: material.candidate.whatChanged,
    announced_at: material.document.publishedAt,
    effective_at: null,
    evidence_level: material.candidate.evidenceLevel,
    confidence: material.candidate.confidence,
    human_review: {
      reviewed_at: material.candidate.reviewedAt,
      reviewed_by: material.candidate.reviewedBy,
      note: material.candidate.reviewNote,
    },
  };
  const sources = [{
    source_id: material.document.id,
    publisher: material.document.publisher,
    source_type: material.document.sourceType,
    title: material.document.title,
    url: material.document.url,
    published_at: material.document.publishedAt,
    excerpt: material.document.body,
  }];
  const usage = emptyUsage();
  let attempts = 0;

  const impactResult = await callWithRetry(client, config, {
    model: config.AI_MODEL_PRIMARY,
    instructions: buildStageInstructions(IMPACT_PROMPT),
    input: {
      runtime: { now, stage_prompt_version: IMPACT_PROMPT_VERSION, input_schema_version: "verified-event.v1" },
      verified_event: verifiedEvent,
      sources,
      target_roles: ["product", "developer", "founder", "researcher"],
    },
    schemaName: "mokuang_impact_analysis",
    jsonSchema: impactAnalysisJsonSchema,
    outputSchema: impactAnalysisOutputSchema,
    reasoningEffort: "low",
  }, options.sleep);
  attempts += impactResult.attempts;
  addUsageInto(usage, impactResult.result.usage);

  const writingModel = impactResult.result.value.needs_review || impactResult.result.value.confidence < config.AI_ESCALATION_CONFIDENCE
    ? config.AI_MODEL_ESCALATION
    : config.AI_MODEL_PRIMARY;
  const writingRequest = {
    model: writingModel,
    instructions: buildStageInstructions(WRITING_PROMPT),
    input: {
      runtime: { now, stage_prompt_version: WRITING_PROMPT_VERSION, input_schema_version: "verified-event-impact.v1" },
      verified_event: verifiedEvent,
      impact_analysis: impactResult.result.value,
      sources,
    },
    schemaName: "mokuang_intelligence_draft",
    jsonSchema: intelligenceDraftJsonSchema,
    outputSchema: intelligenceDraftOutputSchema,
    reasoningEffort: writingModel === config.AI_MODEL_ESCALATION ? "high" : "low",
  } satisfies StructuredModelRequest<IntelligenceDraftOutput>;
  let draftResult;
  try {
    draftResult = await callWithRetry(client, config, writingRequest, options.sleep);
  } catch (error) {
    if (writingModel === config.AI_MODEL_PRIMARY) throw error;
    draftResult = await callWithRetry(client, config, {
      ...writingRequest,
      model: config.AI_MODEL_PRIMARY,
      reasoningEffort: "low",
      retryFeedback: "高能力模型暂时不可用。请严格基于输入生成保守草稿；高风险不确定性必须保留 needs_review=true。",
    }, options.sleep);
  }
  attempts += draftResult.attempts;
  addUsageInto(usage, draftResult.result.usage);

  const normalizedDraft = {
    ...draftResult.result.value,
    deck_zh: truncateText(draftResult.result.value.deck_zh, 50),
    recommended_action: impactResult.result.value.recommended_action,
    evidence_level: material.candidate.evidenceLevel,
  };
  validateDraft(material, normalizedDraft);
  return {
    impact: impactResult.result.value,
    draft: normalizedDraft,
    promptVersion: DRAFTING_PROMPT_BUNDLE_VERSION,
    modelId: draftResult.result.modelId,
    meta: {
      provider: "deepseek",
      attempts,
      latencyMs: Date.now() - startedAt,
      usage: withoutCachedTokens(usage),
    },
  };
}

async function callWithRetry<T>(
  client: DeepSeekResponsesClient,
  config: AiConfig,
  request: StructuredModelRequest<T>,
  sleep: (milliseconds: number) => Promise<void> = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
) {
  let lastError: AiPipelineError | null = null;
  for (let attempt = 0; attempt <= config.AI_MAX_RETRIES; attempt += 1) {
    try {
      const result = await client.generateStructured({
        ...request,
        retryFeedback: attempt === 0
          ? request.retryFeedback
          : `上次输出未通过解析或 Schema 校验（${lastError?.message ?? "unknown"}）。请只返回合法 JSON，并且只引用输入中的 source_id。`,
      });
      return { result, attempts: attempt + 1 };
    } catch (error) {
      lastError = toAiPipelineError(error);
      if (process.env.NODE_ENV !== "test") {
        console.warn("[mokuang-ai] drafting attempt failed", {
          schema: request.schemaName,
          model: request.model,
          attempt: attempt + 1,
          code: lastError.code,
          detail: lastError.message,
        });
      }
      if (!lastError.retryable || attempt >= config.AI_MAX_RETRIES) throw lastError;
      await sleep(150 * (2 ** attempt));
    }
  }
  throw lastError!;
}

function validateDraft(material: ApprovedCandidateMaterial, draft: IntelligenceDraftOutput): void {
  const expectedEventId = eventIdForCandidate(material.candidate.id);
  if (draft.event_id !== expectedEventId) {
    throw new AiPipelineError("MODEL_REFERENCE_INVALID", { retryable: true, internalMessage: "Draft changed event_id" });
  }
  const allowedSourceIds = new Set([material.document.id]);
  if (draft.claims.some((claim) => claim.source_ids.some((sourceId) => !allowedSourceIds.has(sourceId)))) {
    throw new AiPipelineError("MODEL_REFERENCE_INVALID", { retryable: true, internalMessage: "Draft cited an unknown source" });
  }
}

function mockDraft(material: ApprovedCandidateMaterial): DraftingResult {
  const roles: ImpactAnalysisOutput["affected_roles"] = material.candidate.eventType === "research"
    ? [{ role: "researcher", impact_level: "medium", impact: "可评估这项研究是否应进入现有评测或复现计划。", inference_basis: ["what_changed"] }]
    : [{ role: "developer", impact_level: "medium", impact: "需要判断现有技术栈或交付计划是否受到这项变化影响。", inference_basis: ["what_changed"] }];
  const recommendedAction = material.candidate.eventType === "research"
    ? "核对研究方法与自身场景的适用范围，再决定是否安排复现。"
    : "核对当前产品或技术栈是否使用了相关能力，并记录需要验证的兼容性范围。";
  const impact: ImpactAnalysisOutput = {
    task_status: "ok",
    affected_roles: roles,
    recommended_action: recommendedAction,
    action_owner: material.candidate.eventType === "research" ? "research" : "engineering",
    action_urgency: "monitor",
    assumptions: [],
    confidence: material.candidate.confidence,
    needs_review: false,
    review_reasons: [],
  };
  const draft: IntelligenceDraftOutput = {
    event_id: eventIdForCandidate(material.candidate.id),
    title_zh: material.candidate.titleZh.slice(0, 80),
    deck_zh: material.candidate.whatChanged.slice(0, 50),
    what_changed: material.candidate.whatChanged,
    why_it_matters: roles[0].impact ?? "需要结合当前产品与技术栈判断实际影响。",
    affected_roles: roles.map((role) => role.role),
    recommended_action: recommendedAction,
    evidence_level: material.candidate.evidenceLevel,
    claims: [{ text: material.candidate.whatChanged, source_ids: [material.document.id] }],
    confidence: material.candidate.confidence,
    needs_review: false,
    review_reasons: [],
  };
  return {
    impact,
    draft,
    promptVersion: DRAFTING_PROMPT_BUNDLE_VERSION,
    modelId: "mock-drafting-v1",
    meta: { provider: "mock", attempts: 2, latencyMs: 0, usage: withoutCachedTokens(emptyUsage()) },
  };
}

export function eventIdForCandidate(candidateId: string): string {
  return `evt_${candidateId.replace(/^cand_/, "")}`;
}

function emptyUsage(): ModelUsage {
  return { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 };
}

function addUsageInto(target: ModelUsage, source: ModelUsage): void {
  target.inputTokens += source.inputTokens;
  target.cachedInputTokens += source.cachedInputTokens;
  target.outputTokens += source.outputTokens;
  target.reasoningTokens += source.reasoningTokens;
  target.totalTokens += source.totalTokens;
}

function withoutCachedTokens(usage: ModelUsage) {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    reasoningTokens: usage.reasoningTokens,
    totalTokens: usage.totalTokens,
  };
}

function truncateText(value: string, maxLength: number): string {
  const characters = Array.from(value.trim());
  if (characters.length <= maxLength) return characters.join("");
  return `${characters.slice(0, Math.max(1, maxLength - 1)).join("")}…`;
}
