import { describe, expect, it } from "vitest";
import { readAiConfig } from "@/lib/ai/config";
import { generateEventDraft } from "@/lib/ai/drafting";
import { evaluateDraftQuality } from "@/lib/events/quality";
import type { ApprovedCandidateMaterial } from "@/lib/events/types";

const material: ApprovedCandidateMaterial = {
  candidate: {
    id: "cand_approved",
    eventType: "api_change",
    titleZh: "Orbit API｜新增结构化输出参数",
    whatChanged: "Orbit API 新增结构化输出参数，并公布兼容说明。",
    evidenceLevel: "official",
    confidence: 0.94,
    reviewNote: "官方来源可核验。",
    reviewedAt: "2026-08-25T10:00:00.000Z",
    reviewedBy: "reviewer@example.com",
    promptVersion: "G-01.v0.2+P-01.v0.3+P-02.v0.2",
    modelId: "deepseek-v4-flash",
  },
  document: {
    id: "doc_official",
    publisher: "Orbit API",
    sourceType: "official",
    title: "Structured output update",
    url: "https://example.com/orbit-update",
    publishedAt: "2026-08-25T09:00:00.000Z",
    body: "Orbit API added a structured output parameter and published compatibility notes.",
  },
};

describe("formal event drafting", () => {
  it("turns an approved candidate into a cited draft without publishing", async () => {
    const result = await generateEventDraft(material, readAiConfig({ AI_PROVIDER: "mock" }));
    const quality = evaluateDraftQuality(material, result);

    expect(result.draft.event_id).toBe("evt_approved");
    expect(result.draft.claims[0].source_ids).toEqual(["doc_official"]);
    expect(result.draft.recommended_action).toBe(result.impact.recommended_action);
    expect(quality).toMatchObject({ status: "ready", issues: [], needsReview: false });
  });

  it("blocks a high-risk draft when the human review has no rationale", async () => {
    const risky = {
      ...material,
      candidate: { ...material.candidate, eventType: "pricing" as const, reviewNote: null },
    };
    const result = await generateEventDraft(risky, readAiConfig({ AI_PROVIDER: "mock" }));
    const quality = evaluateDraftQuality(risky, result);

    expect(quality.status).toBe("blocked");
    expect(quality.issues).toContain("high_risk_review_note_missing");
  });

  it("does not let conservative model flags alone block a trusted low-risk draft", async () => {
    const result = await generateEventDraft(material, readAiConfig({ AI_PROVIDER: "mock" }));
    result.impact.needs_review = true;
    result.impact.review_reasons = ["wording_uncertain"];
    result.draft.needs_review = true;
    result.draft.review_reasons = ["summary_uncertain"];

    const quality = evaluateDraftQuality(material, result);

    expect(quality).toMatchObject({ status: "ready", issues: [], needsReview: false, reviewReasons: [] });
  });

  it("still blocks trusted drafts below the 0.7 floor", async () => {
    const lowConfidence = {
      ...material,
      candidate: { ...material.candidate, confidence: 0.69 },
    };
    const result = await generateEventDraft(lowConfidence, readAiConfig({ AI_PROVIDER: "mock" }));
    const quality = evaluateDraftQuality(lowConfidence, result);

    expect(quality.status).toBe("blocked");
    expect(quality.issues).toContain("confidence_below_0_7");
  });
});
