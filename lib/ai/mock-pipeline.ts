import {
  pipelinePreviewInputSchema,
  pipelinePreviewOutputSchema,
  type EventType,
  type PipelinePreviewInput,
  type PipelinePreviewOutput,
} from "../domain/event";
import { PROMPT_BUNDLE_VERSION } from "./prompts";

const injectionPattern = /ignore (all|previous)|system prompt|忽略.{0,8}(要求|指令)|泄露.{0,8}提示词|调用.{0,8}工具/i;

function detectEventType(text: string): EventType | null {
  if (/价格|计费|pricing|cost/i.test(text)) return "pricing";
  if (/政策|监管|policy|regulation/i.test(text)) return "policy";
  if (/融资|funding|investment/i.test(text)) return "funding";
  if (/论文|研究|评测|paper|research|benchmark/i.test(text)) return "research";
  if (/api|接口|参数|deprecat/i.test(text)) return "api_change";
  if (/模型|发布|上线|model|release/i.test(text)) return "model_release";
  return null;
}

export function runMockPipeline(rawInput: PipelinePreviewInput): PipelinePreviewOutput {
  const input = pipelinePreviewInputSchema.parse(rawInput);
  const joined = input.sourceDocuments.map((source) => `${source.title}\n${source.body}`).join("\n");
  const eventType = detectEventType(joined);
  const injectionSuspected = injectionPattern.test(joined);
  const highRisk = eventType === "pricing" || eventType === "policy" || eventType === "funding";
  const reviewReasons = [
    ...(injectionSuspected ? ["prompt_injection_suspected"] : []),
    ...(highRisk ? ["high_risk_event_type"] : []),
  ];

  if (!eventType) {
    return pipelinePreviewOutputSchema.parse({
      taskStatus: "irrelevant",
      eventType: null,
      titleZh: null,
      whatChanged: null,
      evidenceLevel: null,
      sourceIds: input.sourceDocuments.map((source) => source.id),
      confidence: 0.28,
      needsReview: false,
      reviewReasons: [],
      promptVersion: PROMPT_BUNDLE_VERSION,
      modelId: "mock-v1",
    });
  }

  const first = input.sourceDocuments[0];
  const normalizedBody = first.body.replace(/\s+/g, " ").trim();
  const officialCount = input.sourceDocuments.filter((source) => source.sourceType === "official").length;
  const evidenceLevel = officialCount > 0
    ? "official"
    : input.sourceDocuments.length > 1
      ? "corroborated"
      : "reported";

  return pipelinePreviewOutputSchema.parse({
    taskStatus: "ok",
    eventType,
    titleZh: `预览｜${first.title}`,
    whatChanged: normalizedBody.slice(0, 180),
    evidenceLevel,
    sourceIds: input.sourceDocuments.map((source) => source.id),
    confidence: injectionSuspected ? 0.55 : input.sourceDocuments.length > 1 ? 0.9 : 0.78,
    needsReview: reviewReasons.length > 0,
    reviewReasons,
    promptVersion: PROMPT_BUNDLE_VERSION,
    modelId: "mock-v1",
  });
}
