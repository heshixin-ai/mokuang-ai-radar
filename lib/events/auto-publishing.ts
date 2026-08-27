import type { AiConfig } from "@/lib/ai/config";
import type { ClusterDecisionView } from "@/lib/clustering/types";
import type { EventAdminView } from "@/lib/events/types";
import type { AutoPublishConfig } from "@/lib/events/auto-publish-config";
import type { ReviewActor } from "@/lib/repository/ingestion-contract";
import type {
  AutoPublishCandidate,
  AutoPublishingRepository,
} from "@/lib/repository/auto-publishing";

const allowedEventTypes = new Set(["model_release", "api_change", "research"]);
const softCandidateReviewReasons = new Set(["draft_quality_blocked"]);
const softDraftQualityIssues = new Set([
  "confidence_below_0_8",
  "impact_model_requested_review",
  "draft_model_requested_review",
]);
const candidateApprovalNote = "自动发布策略 v3：可信一手来源、低风险类型且置信度达到 0.7，进入正式质量门禁。";
const publicationNote = "自动发布策略 v3：可信一手证据、引用完整且无实质质量风险，自动发布。";

export type AutoPublishOutcome = {
  candidateId: string;
  eventId: string | null;
  status: "published" | "deferred" | "failed";
  reason: string;
};

export type AutoPublishSummary = {
  mode: AutoPublishConfig["AUTO_PUBLISH_MODE"];
  scanned: number;
  eligible: number;
  attempted: number;
  published: number;
  deferred: number;
  failed: number;
  outcomes: AutoPublishOutcome[];
};

export type AutoPublishingOperations = {
  approveCandidate(candidateId: string, note: string, actor: ReviewActor): Promise<void>;
  clusterCandidate(candidateId: string): Promise<ClusterDecisionView>;
  createDraft(candidateId: string, actor: ReviewActor): Promise<EventAdminView>;
  publishEvent(
    eventId: string,
    note: string,
    actor: ReviewActor,
    allowSoftQuality: boolean,
  ): Promise<EventAdminView>;
};

export async function runSafeAutoPublishingBatch(options: {
  repository: AutoPublishingRepository;
  operations: AutoPublishingOperations;
  config: AutoPublishConfig;
  actor: ReviewActor;
}): Promise<AutoPublishSummary> {
  if (options.config.AUTO_PUBLISH_MODE === "off") return emptySummary("off");

  const scanLimit = Math.max(20, options.config.AUTO_PUBLISH_BATCH_SIZE * 10);
  const candidates = await options.repository.listCandidates(scanLimit);
  const eligibleCandidates = candidates.filter((candidate) => (
    candidatePolicyReason(candidate, options.config) === null
  )).slice(0, options.config.AUTO_PUBLISH_BATCH_SIZE);
  const policyDeferred = candidates.length - candidates.filter((candidate) => (
    candidatePolicyReason(candidate, options.config) === null
  )).length;
  const outcomes: AutoPublishOutcome[] = [];

  for (const candidate of eligibleCandidates) {
    try {
      if (candidate.reviewStatus === "pending") {
        await options.operations.approveCandidate(candidate.id, candidateApprovalNote, options.actor);
      }

      const cluster = await options.operations.clusterCandidate(candidate.id);
      if (cluster.action !== "create_new" || !["confirmed", "dismissed"].includes(cluster.status)) {
        outcomes.push({
          candidateId: candidate.id,
          eventId: cluster.targetEventId,
          status: "deferred",
          reason: "cluster_review_required",
        });
        continue;
      }

      const draft = await options.operations.createDraft(candidate.id, options.actor);
      const draftReason = draftPolicyReason(draft, options.config);
      if (draftReason) {
        await options.repository.markCandidateForReview(candidate.id, draftReason);
        outcomes.push({ candidateId: candidate.id, eventId: draft.id, status: "deferred", reason: draftReason });
        continue;
      }

      if (draft.status === "published") {
        outcomes.push({ candidateId: candidate.id, eventId: draft.id, status: "published", reason: "already_published" });
        continue;
      }

      const published = await options.operations.publishEvent(
        draft.id,
        publicationNote,
        options.actor,
        draft.qualityStatus === "blocked",
      );
      outcomes.push({ candidateId: candidate.id, eventId: published.id, status: "published", reason: "safe_policy_passed" });
    } catch {
      try {
        await options.repository.recordCandidateFailure(candidate.id);
      } catch {
        // Keep the original workflow failure as the public outcome; a later run may retry the candidate.
      }
      outcomes.push({ candidateId: candidate.id, eventId: null, status: "failed", reason: "workflow_failed" });
    }
  }

  return {
    mode: "safe",
    scanned: candidates.length,
    eligible: eligibleCandidates.length,
    attempted: outcomes.length,
    published: outcomes.filter((outcome) => outcome.status === "published").length,
    deferred: policyDeferred + outcomes.filter((outcome) => outcome.status === "deferred").length,
    failed: outcomes.filter((outcome) => outcome.status === "failed").length,
    outcomes,
  };
}

export function candidatePolicyReason(
  candidate: AutoPublishCandidate,
  config: AutoPublishConfig,
): string | null {
  if (config.AUTO_PUBLISH_MODE !== "safe") return "auto_publish_disabled";
  if (candidate.provider !== "deepseek") return "provider_not_production";
  const isPrimaryResearch = candidate.eventType === "research" && candidate.sourceType === "research";
  if (candidate.sourceType !== "official" && !isPrimaryResearch) return "source_not_official";
  if (candidate.evidenceLevel !== "official") return "evidence_not_official";
  if (!allowedEventTypes.has(candidate.eventType)) return "event_type_requires_review";
  const hasOnlySoftReviewReasons = candidate.reviewReasons.length > 0
    && candidate.reviewReasons.every((reason) => softCandidateReviewReasons.has(reason));
  if (candidate.needsReview && !hasOnlySoftReviewReasons) return "candidate_requires_review";
  if (candidate.reviewReasons.length > 0 && !hasOnlySoftReviewReasons) return "candidate_review_reasons_present";
  if (candidate.confidence < config.AUTO_PUBLISH_MIN_CONFIDENCE) return "confidence_below_threshold";
  return null;
}

export function draftPolicyReason(event: EventAdminView, config: AutoPublishConfig): string | null {
  if (event.status === "published") return null;
  if (event.status !== "draft") return "event_state_requires_review";
  if (!allowedEventTypes.has(event.eventType)) return "event_type_requires_review";
  if (event.evidenceLevel !== "official") return "evidence_not_official";
  const allowsPrimaryResearch = event.eventType === "research";
  if (event.sources.length === 0 || event.sources.some((source) => (
    source.sourceType !== "official" && !(allowsPrimaryResearch && source.sourceType === "research")
  ))) {
    return "draft_source_not_official";
  }
  if (event.confidence < config.AUTO_PUBLISH_MIN_CONFIDENCE) return "draft_confidence_below_threshold";
  if (event.citations.length === 0) return "draft_citations_missing";
  const sourceIds = new Set(event.sources.map((source) => source.id));
  if (event.citations.some((citation) => !sourceIds.has(citation.sourceId))) return "draft_citation_source_missing";
  const hasOnlySoftQualityIssues = event.qualityIssues.length > 0
    && event.qualityIssues.every((issue) => softDraftQualityIssues.has(issue));
  const softBlockedDraft = event.qualityStatus === "blocked" && hasOnlySoftQualityIssues;
  if (event.qualityStatus !== "ready" && !softBlockedDraft) return "draft_quality_blocked";
  if (event.qualityIssues.length > 0 && !softBlockedDraft) return "draft_quality_blocked";
  if ((event.needsReview || event.reviewReasons.length > 0) && !softBlockedDraft) return "draft_requires_review";
  return null;
}

export async function createD1AutoPublishingOperations(
  database: D1Database,
  aiConfig: AiConfig,
): Promise<AutoPublishingOperations> {
  const [ingestionModule, clusteringModule, eventModule, ingestionRepositoryModule, clusteringRepositoryModule, eventRepositoryModule] = await Promise.all([
    import("@/lib/ingestion/service"),
    import("@/lib/clustering/service"),
    import("@/lib/events/service"),
    import("@/lib/repository/ingestion"),
    import("@/lib/repository/clustering"),
    import("@/lib/repository/event-workflow"),
  ]);
  const ingestionRepository = ingestionRepositoryModule.createD1IngestionRepository(database);
  const clusteringRepository = new clusteringRepositoryModule.D1ClusteringRepository(database);
  const eventRepository = new eventRepositoryModule.D1EventWorkflowRepository(database);

  return {
    async approveCandidate(candidateId, note, actor) {
      await ingestionModule.reviewEventCandidate(candidateId, "approve", note, actor, { repository: ingestionRepository });
    },
    clusterCandidate(candidateId) {
      return clusteringModule.clusterApprovedCandidate(candidateId, { repository: clusteringRepository });
    },
    createDraft(candidateId, actor) {
      return eventModule.createEventDraft(candidateId, actor, { repository: eventRepository, config: aiConfig });
    },
    publishEvent(eventId, note, actor, allowSoftQuality) {
      return eventModule.transitionEventPublication(eventId, "publish", note, actor, {
        repository: eventRepository,
        allowSoftQuality,
      });
    },
  };
}

function emptySummary(mode: AutoPublishSummary["mode"]): AutoPublishSummary {
  return { mode, scanned: 0, eligible: 0, attempted: 0, published: 0, deferred: 0, failed: 0, outcomes: [] };
}
