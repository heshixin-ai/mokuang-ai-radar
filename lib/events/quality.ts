import type { DraftingResult } from "@/lib/ai/drafting";
import type { ApprovedCandidateMaterial, EventQualityStatus } from "@/lib/events/types";

const highRiskTypes = new Set(["pricing", "policy", "funding"]);

export function evaluateDraftQuality(
  material: ApprovedCandidateMaterial,
  result: DraftingResult,
): { status: EventQualityStatus; issues: string[]; confidence: number; needsReview: boolean; reviewReasons: string[] } {
  const issues = new Set<string>();
  const reviewReasons = new Set([
    ...result.impact.review_reasons,
    ...result.draft.review_reasons,
  ]);
  const confidence = Math.min(material.candidate.confidence, result.impact.confidence, result.draft.confidence);
  const isPrimaryResearch = material.candidate.eventType === "research" && material.document.sourceType === "research";
  const isTrustedLowRisk = !highRiskTypes.has(material.candidate.eventType)
    && (material.document.sourceType === "official" || isPrimaryResearch)
    && material.candidate.evidenceLevel === "official";

  if (result.impact.task_status !== "ok") issues.add("impact_insufficient_evidence");
  if (result.impact.affected_roles.every((role) => role.impact_level === "none")) issues.add("affected_roles_missing");
  if (result.draft.claims.length === 0) issues.add("citations_missing");
  if (confidence < 0.7) issues.add("confidence_below_0_7");
  if (result.impact.needs_review && !isTrustedLowRisk) issues.add("impact_model_requested_review");
  if (result.draft.needs_review && !isTrustedLowRisk) issues.add("draft_model_requested_review");
  if (material.candidate.evidenceLevel === "lead_only") issues.add("lead_only_cannot_publish");
  if (highRiskTypes.has(material.candidate.eventType) && !material.candidate.reviewNote?.trim()) {
    issues.add("high_risk_review_note_missing");
  }

  return {
    status: issues.size === 0 ? "ready" : "blocked",
    issues: [...issues],
    confidence,
    needsReview: isTrustedLowRisk ? false : result.impact.needs_review || result.draft.needs_review,
    reviewReasons: isTrustedLowRisk ? [] : [...reviewReasons],
  };
}
