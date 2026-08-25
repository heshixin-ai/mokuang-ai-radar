import { describe, expect, it, vi } from "vitest";
import { readAiConfig } from "../lib/ai/config";
import type { ExtractionCandidate, ExtractionOutput } from "../lib/ai/contracts";
import { AiPipelineError } from "../lib/ai/errors";
import { runDeepSeekPipeline, validateExtractionReferences } from "../lib/ai/pipeline";

const source = {
  id: "src-official",
  publisher: "Orbit 官方",
  title: "Orbit API 发布严格 JSON Schema 输出",
  url: "https://example.com/orbit-json",
  sourceType: "official" as const,
  publishedAt: "2026-08-25T09:00:00+08:00",
  body: "Orbit API 今日发布严格 JSON Schema 输出参数。旧接口仍可使用，迁移日期为 2026 年 9 月 1 日。",
};

const secondSource = {
  ...source,
  id: "src-media",
  publisher: "AI 产品观察",
  title: "Orbit API 增加 JSON Schema",
  url: "https://example.com/orbit-json-report",
  sourceType: "media" as const,
  body: "Orbit API 已增加严格 JSON Schema 输出参数，官方同时给出了兼容说明。",
};

function candidate(overrides: Partial<ExtractionCandidate> = {}): ExtractionCandidate {
  return {
    candidate_id: "cand-orbit-json",
    source_id: "src-official",
    event_type: "api_change",
    subject: { name: "Orbit API", type: "api" },
    change_statement: "Orbit API 发布严格 JSON Schema 输出参数。",
    before: null,
    after: "支持严格 JSON Schema 输出参数",
    announced_at: "2026-08-25T09:00:00+08:00",
    effective_at: null,
    entities: ["Orbit API"],
    evidence_spans: [{
      source_id: "src-official",
      quote: "Orbit API 今日发布严格 JSON Schema 输出参数。",
      supports: ["change_statement", "after"],
    }],
    evidence_level: "official",
    injection_suspected: false,
    confidence: 0.94,
    needs_review: false,
    review_reasons: [],
    ...overrides,
  };
}

function extraction(candidates: ExtractionCandidate[]): ExtractionOutput {
  return { task_status: candidates.length > 0 ? "ok" : "irrelevant", candidates };
}

function modelResponse(value: unknown, model = "deepseek-v4-flash"): Response {
  return Response.json({
    id: "resp-test",
    object: "response",
    created_at: 1,
    status: "completed",
    model,
    output: [{
      type: "message",
      id: "msg-test",
      status: "completed",
      role: "assistant",
      content: [{ type: "output_text", text: typeof value === "string" ? value : JSON.stringify(value) }],
    }],
    usage: {
      input_tokens: 100,
      input_tokens_details: { cached_tokens: 20 },
      output_tokens: 30,
      output_tokens_details: { reasoning_tokens: 5 },
      total_tokens: 130,
    },
  });
}

function config(overrides: Record<string, string> = {}) {
  return readAiConfig({
    AI_PROVIDER: "deepseek",
    AI_BASE_URL: "https://api.deepseek.com",
    AI_MODEL_PRIMARY: "deepseek-v4-flash",
    AI_MODEL_ESCALATION: "deepseek-v4-pro",
    AI_API_KEY: "test-only-key",
    AI_TIMEOUT_MS: "5000",
    AI_MAX_RETRIES: "0",
    AI_ESCALATION_CONFIDENCE: "0.8",
    AI_MAX_OUTPUT_TOKENS: "8192",
    ...overrides,
  });
}

function queuedFetch(responses: Response[]) {
  return vi.fn(async () => {
    const response = responses.shift();
    if (!response) throw new Error("Unexpected model request");
    return response;
  });
}

describe("AI 配置", () => {
  it("DeepSeek 模式缺少 Key 时返回受控配置错误", () => {
    expect(() => readAiConfig({ AI_PROVIDER: "deepseek" })).toThrowError(AiPipelineError);
    try {
      readAiConfig({ AI_PROVIDER: "deepseek" });
    } catch (error) {
      expect((error as AiPipelineError).code).toBe("AI_CONFIG_INVALID");
    }
  });
});

describe("DeepSeek Flash → Pro 路由", () => {
  it("普通官方 API 变化只调用 Flash", async () => {
    const fetchImplementation = queuedFetch([modelResponse(extraction([candidate()]))]);
    const result = await runDeepSeekPipeline(
      { sourceDocuments: [source] },
      config(),
      { fetchImplementation, now: new Date("2026-08-25T12:00:00+08:00") },
    );

    expect(result.data.eventType).toBe("api_change");
    expect(result.data.modelId).toBe("deepseek-v4-flash");
    expect(result.data.needsReview).toBe(false);
    expect(result.meta.escalated).toBe(false);
    expect(result.meta.usage.totalTokens).toBe(130);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);

    const request = JSON.parse(fetchImplementation.mock.calls[0][1]!.body as string);
    expect(request.model).toBe("deepseek-v4-flash");
    expect(request.reasoning.effort).toBe("none");
    expect(request.text.format.type).toBe("json_schema");
    expect(request.input).not.toContain("test-only-key");
  });

  it("价格事件升级到 Pro 且始终保留人工审核", async () => {
    const priceCandidate = candidate({
      event_type: "pricing",
      change_statement: "Orbit API 公布新的缓存输入价格。",
      after: "缓存输入执行新价格",
      evidence_spans: [{
        source_id: "src-official",
        quote: "Orbit API 今日发布严格 JSON Schema 输出参数。",
        supports: ["change_statement"],
      }],
      needs_review: true,
      review_reasons: ["pricing_change"],
    });
    const proCandidate = { ...priceCandidate, confidence: 0.97 };
    const fetchImplementation = queuedFetch([
      modelResponse(extraction([priceCandidate])),
      modelResponse(extraction([proCandidate]), "deepseek-v4-pro"),
    ]);

    const result = await runDeepSeekPipeline(
      { sourceDocuments: [source] },
      config(),
      { fetchImplementation },
    );

    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    const secondRequest = JSON.parse(fetchImplementation.mock.calls[1][1]!.body as string);
    expect(secondRequest.model).toBe("deepseek-v4-pro");
    expect(result.meta.escalated).toBe(true);
    expect(result.data.modelId).toBe("deepseek-v4-pro");
    expect(result.data.needsReview).toBe(true);
    expect(result.data.reviewReasons).toContain("high_risk_event_type");
  });

  it("结构错误时重试一次 Flash", async () => {
    const fetchImplementation = queuedFetch([
      modelResponse("not-json"),
      modelResponse(extraction([candidate()])),
    ]);
    const result = await runDeepSeekPipeline(
      { sourceDocuments: [source] },
      config({ AI_MAX_RETRIES: "1" }),
      { fetchImplementation, sleep: async () => undefined },
    );

    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(result.meta.attempts).toBe(2);
    expect(result.meta.escalated).toBe(false);
  });

  it("多个候选进入独立 P-02 合并阶段", async () => {
    const mediaCandidate = candidate({
      candidate_id: "cand-orbit-json-media",
      source_id: "src-media",
      evidence_spans: [{
        source_id: "src-media",
        quote: "Orbit API 已增加严格 JSON Schema 输出参数",
        supports: ["change_statement"],
      }],
      evidence_level: "reported",
      confidence: 0.9,
    });
    const merging = {
      task_status: "ok",
      decisions: [candidate(), mediaCandidate].map((item) => ({
        candidate_id: item.candidate_id,
        action: "create_new",
        target_event_id: null,
        canonical_subject: "Orbit API",
        canonical_change_key: "Orbit API|JSON Schema|发布|全局",
        matched_source_ids: [item.source_id],
        conflict: false,
        conflict_fields: [],
        evidence_level: "corroborated",
        confidence: 0.91,
        needs_review: false,
        review_reasons: [],
      })),
    };
    const fetchImplementation = queuedFetch([
      modelResponse(extraction([candidate(), mediaCandidate])),
      modelResponse(merging),
    ]);

    const result = await runDeepSeekPipeline(
      { sourceDocuments: [source, secondSource] },
      config(),
      { fetchImplementation },
    );

    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(result.meta.stages.map((stage) => stage.stage)).toEqual(["P-01", "P-02"]);
    expect(result.data.sourceIds).toEqual(expect.arrayContaining(["src-official", "src-media"]));
  });

  it("认证失败不会把上游正文或密钥放进错误", async () => {
    const fetchImplementation = queuedFetch([new Response(null, { status: 401 })]);
    await expect(runDeepSeekPipeline(
      { sourceDocuments: [source] },
      config(),
      { fetchImplementation },
    )).rejects.toMatchObject({ code: "MODEL_AUTH_FAILED", retryable: false });
  });
});

describe("确定性来源门禁", () => {
  it("拒绝模型编造的 source_id", () => {
    const invalid = extraction([candidate({
      evidence_spans: [{ source_id: "src-invented", quote: "不存在", supports: ["after"] }],
    })]);
    expect(() => validateExtractionReferences(invalid, new Map([[source.id, source]])))
      .toThrowError(AiPipelineError);
  });
});
