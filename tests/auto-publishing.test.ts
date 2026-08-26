import { describe, expect, it } from "vitest";
import { readAutoPublishConfig } from "@/lib/events/auto-publish-config";
import {
  candidatePolicyReason,
  draftPolicyReason,
  runSafeAutoPublishingBatch,
  type AutoPublishingOperations,
} from "@/lib/events/auto-publishing";
import type { EventAdminView } from "@/lib/events/types";
import type { AutoPublishCandidate, AutoPublishingRepository } from "@/lib/repository/auto-publishing";
import type { ReviewActor } from "@/lib/repository/ingestion-contract";

const actor: ReviewActor = {
  id: "review-automation",
  email: "automation@mokuang.internal",
  displayName: "自动发布",
};

const safeConfig = readAutoPublishConfig({
  AUTO_PUBLISH_MODE: "safe",
  AUTO_PUBLISH_MIN_CONFIDENCE: "0.8",
  AUTO_PUBLISH_BATCH_SIZE: "1",
});

const safeCandidate: AutoPublishCandidate = {
  id: "cand_safe",
  reviewStatus: "pending",
  eventType: "api_change",
  evidenceLevel: "official",
  confidence: 0.95,
  needsReview: false,
  reviewReasons: [],
  sourceType: "official",
  provider: "deepseek",
  escalated: false,
};

describe("safe auto-publish policy", () => {
  it("is fail-closed by default and accepts only an explicit safe mode", () => {
    expect(readAutoPublishConfig({})).toMatchObject({
      AUTO_PUBLISH_MODE: "off",
      AUTO_PUBLISH_MIN_CONFIDENCE: 0.8,
      AUTO_PUBLISH_BATCH_SIZE: 1,
    });
    expect(safeConfig.AUTO_PUBLISH_MODE).toBe("safe");
    expect(() => readAutoPublishConfig({ AUTO_PUBLISH_MIN_CONFIDENCE: "0.5" })).toThrow();
  });

  it("allows an official production candidate at the configured 0.8 threshold", () => {
    expect(candidatePolicyReason({ ...safeCandidate, confidence: 0.8 }, safeConfig)).toBeNull();
  });

  it.each([
    [{ ...safeCandidate, provider: "mock" }, "provider_not_production"],
    [{ ...safeCandidate, sourceType: "media" as const }, "source_not_official"],
    [{ ...safeCandidate, eventType: "pricing" as const }, "event_type_requires_review"],
    [{ ...safeCandidate, needsReview: true }, "candidate_requires_review"],
    [{ ...safeCandidate, reviewReasons: ["conflicting_numbers"] }, "candidate_review_reasons_present"],
    [{ ...safeCandidate, escalated: true }, "candidate_escalated"],
    [{ ...safeCandidate, confidence: 0.79 }, "confidence_below_threshold"],
  ])("defers unsafe candidates deterministically", (candidate, reason) => {
    expect(candidatePolicyReason(candidate as AutoPublishCandidate, safeConfig)).toBe(reason);
  });

  it("requires the generated draft to pass the second safety gate", () => {
    expect(draftPolicyReason(makeDraft(), safeConfig)).toBeNull();
    expect(draftPolicyReason(makeDraft({ qualityStatus: "blocked", qualityIssues: ["citations_missing"] }), safeConfig))
      .toBe("draft_quality_blocked");
    expect(draftPolicyReason(makeDraft({ needsReview: true }), safeConfig)).toBe("draft_requires_review");
  });
});

describe("safe auto-publish orchestration", () => {
  it("skips risky candidates and publishes one bounded safe candidate with a full audit actor", async () => {
    const calls: string[] = [];
    const repository = memoryRepository([
      { ...safeCandidate, id: "cand_risky", eventType: "policy", needsReview: true },
      safeCandidate,
    ]);
    const summary = await runSafeAutoPublishingBatch({
      repository,
      operations: successfulOperations(calls),
      config: safeConfig,
      actor,
    });

    expect(calls).toEqual([
      "approve:cand_safe:automation@mokuang.internal",
      "cluster:cand_safe",
      "draft:cand_safe:automation@mokuang.internal",
      "publish:evt_safe:automation@mokuang.internal",
    ]);
    expect(summary).toMatchObject({ scanned: 2, eligible: 1, attempted: 1, published: 1, deferred: 1, failed: 0 });
    expect(summary.outcomes[0]).toMatchObject({ status: "published", eventId: "evt_safe" });
  });

  it("leaves merge suggestions for human review and does not draft or publish", async () => {
    const calls: string[] = [];
    const operations = successfulOperations(calls);
    operations.clusterCandidate = async (candidateId) => {
      calls.push(`cluster:${candidateId}`);
      return {
        id: "clu_merge",
        candidateId,
        candidateTitle: "重复事件",
        action: "merge_suggested",
        targetEventId: "evt_existing",
        targetEventTitle: "已有事件",
        similarity: 0.93,
        reasons: ["same_event_type"],
        status: "proposed",
        decidedBy: "rules",
        reviewedAt: null,
        reviewedBy: null,
        reviewNote: null,
        createdAt: "2026-08-26T10:00:00.000Z",
        updatedAt: "2026-08-26T10:00:00.000Z",
      };
    };

    const summary = await runSafeAutoPublishingBatch({
      repository: memoryRepository([safeCandidate], calls),
      operations,
      config: safeConfig,
      actor,
    });

    expect(calls).toEqual([
      "approve:cand_safe:automation@mokuang.internal",
      "cluster:cand_safe",
    ]);
    expect(summary.outcomes[0]).toMatchObject({ status: "deferred", reason: "cluster_review_required" });
  });

  it("does not publish a draft blocked by the deterministic quality gate", async () => {
    const calls: string[] = [];
    const operations = successfulOperations(calls);
    operations.createDraft = async (candidateId, reviewActor) => {
      calls.push(`draft:${candidateId}:${reviewActor.email}`);
      return makeDraft({ qualityStatus: "blocked", qualityIssues: ["confidence_below_0_8"] });
    };

    const summary = await runSafeAutoPublishingBatch({
      repository: memoryRepository([safeCandidate], calls),
      operations,
      config: safeConfig,
      actor,
    });

    expect(calls.some((call) => call.startsWith("publish:"))).toBe(false);
    expect(calls).toContain("review:cand_safe:draft_quality_blocked");
    expect(summary.outcomes[0]).toMatchObject({ status: "deferred", reason: "draft_quality_blocked" });
  });

  it("moves a transient workflow failure to the back of the queue", async () => {
    const calls: string[] = [];
    const operations = successfulOperations(calls);
    operations.createDraft = async () => {
      throw new Error("temporary model failure");
    };

    const summary = await runSafeAutoPublishingBatch({
      repository: memoryRepository([safeCandidate], calls),
      operations,
      config: safeConfig,
      actor,
    });

    expect(calls).toContain("failure:cand_safe");
    expect(summary.outcomes[0]).toMatchObject({ status: "failed", reason: "workflow_failed" });
  });
});

function memoryRepository(candidates: AutoPublishCandidate[], calls: string[] = []): AutoPublishingRepository {
  return {
    listCandidates: async (limit) => candidates.slice(0, limit),
    markCandidateForReview: async (candidateId, reason) => { calls.push(`review:${candidateId}:${reason}`); },
    recordCandidateFailure: async (candidateId) => { calls.push(`failure:${candidateId}`); },
  };
}

function successfulOperations(calls: string[]): AutoPublishingOperations {
  return {
    async approveCandidate(candidateId, _note, reviewActor) {
      calls.push(`approve:${candidateId}:${reviewActor.email}`);
    },
    async clusterCandidate(candidateId) {
      calls.push(`cluster:${candidateId}`);
      return {
        id: "clu_safe",
        candidateId,
        candidateTitle: "安全候选",
        action: "create_new",
        targetEventId: null,
        targetEventTitle: null,
        similarity: 0,
        reasons: ["no_same_type_event"],
        status: "confirmed",
        decidedBy: "rules",
        reviewedAt: null,
        reviewedBy: null,
        reviewNote: null,
        createdAt: "2026-08-26T10:00:00.000Z",
        updatedAt: "2026-08-26T10:00:00.000Z",
      };
    },
    async createDraft(candidateId, reviewActor) {
      calls.push(`draft:${candidateId}:${reviewActor.email}`);
      return makeDraft();
    },
    async publishEvent(eventId, _note, reviewActor) {
      calls.push(`publish:${eventId}:${reviewActor.email}`);
      return makeDraft({ status: "published", publishedAt: "2026-08-26T10:01:00.000Z", publishedBy: reviewActor.email });
    },
  };
}

function makeDraft(overrides: Partial<EventAdminView> = {}): EventAdminView {
  return {
    id: "evt_safe",
    candidateId: "cand_safe",
    status: "draft",
    eventType: "api_change",
    titleZh: "GitHub 规则洞察仪表板正式可用",
    deckZh: "GitHub 规则洞察仪表板已在仓库和组织层级正式可用。",
    whatChanged: "GitHub 将规则洞察仪表板从公开预览转为正式可用。",
    before: null,
    after: "仓库和组织层级正式可用。",
    whyItMatters: "管理员可以更稳定地检查规则执行结果。",
    recommendedAction: "检查组织的规则执行情况。",
    affectedRoles: [{ role: "developer", level: "medium", impact: "可观察规则执行。" }],
    evidenceLevel: "official",
    confidence: 0.95,
    needsReview: false,
    reviewReasons: [],
    announcedAt: "2026-08-26T09:00:00.000Z",
    effectiveAt: null,
    qualityStatus: "ready",
    qualityIssues: [],
    promptVersion: "G-01.v0.2+P-03.v0.1+P-04.v0.1",
    modelId: "deepseek-v4-flash",
    provider: "deepseek",
    attempts: 1,
    latencyMs: 2_000,
    usage: { inputTokens: 100, outputTokens: 80, totalTokens: 180, reasoningTokens: 0 },
    publishedAt: null,
    publishedBy: null,
    createdAt: "2026-08-26T10:00:00.000Z",
    updatedAt: "2026-08-26T10:00:00.000Z",
    sources: [{
      id: "doc_safe",
      publisher: "GitHub Changelog",
      title: "Rule insights dashboard generally available",
      url: "https://github.blog/changelog/rule-insights-dashboard",
      sourceType: "official",
      publishedAt: "2026-08-26T09:00:00.000Z",
    }],
    citations: [{ id: "cit_safe", sourceId: "doc_safe", claim: "规则洞察正式可用。", supports: ["whatChanged"] }],
    revisions: [],
    ...overrides,
  };
}
