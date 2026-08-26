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
const candidateApprovalNote = "自动发布策略 v1：官方来源、高置信度且无风险标记，进入正式质量门禁。";
const publicationNote = "自动发布策略 v1：官方证据、高置信度、无复核标记，且草稿通过确定性质量门禁。";

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
  publishEvent(eventId: string, note: string, actor: ReviewActor): Promise<EventAdminView>;
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
        outcomes.push({ candidateId: candidate.id, eventId: draft.id, status: "deferred", reason: draftReason });
        continue;
      }

      if (draft.status === "published") {
        outcomes.push({ candidateId: candidate.id, eventId: draft.id, status: "published", reason: "already_published" });
        continue;
      }

      const published = await options.operations.publishEvent(draft.id, publicationNote, options.actor);
      outcomes.push({ candidateId: candidate.id, eventId: published.id, status: "published", reason: "safe_policy_passed" });
    } catch {
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
  if (candidate.sourceType !== "official") return "source_not_official";
  if (candidate.evidenceLevel !== "official") return "evidence_not_official";
  if (!allowedEventTypes.has(candidate.eventType)) return "event_type_requires_review";
  if (candidate.needsReview) return "candidate_requires_review";
  if (candidate.reviewReasons.length > 0) return "candidate_review_reasons_present";
  if (candidate.escalated) return "candidate_escalated";
  if (candidate.confidence < config.AUTO_PUBLISH_MIN_CONFIDENCE) return "confidence_below_threshold";
  return null;
}

export function draftPolicyReason(event: EventAdminView, config: AutoPublishConfig): string | null {
  if (event.status === "published") return null;
  if (event.status !== "draft") return "event_state_requires_review";
  if (!allowedEventTypes.has(event.eventType)) return "event_type_requires_review";
  if (event.evidenceLevel !== "official") return "evidence_not_official";
  if (event.sources.length === 0 || event.sources.some((source) => source.sourceType !== "official")) {
    return "draft_source_not_official";
  }
  if (event.qualityStatus !== "ready" || event.qualityIssues.length > 0) return "draft_quality_blocked";
  if (event.needsReview || event.reviewReasons.length > 0) return "draft_requires_review";
  if (event.confidence < config.AUTO_PUBLISH_MIN_CONFIDENCE) return "draft_confidence_below_threshold";
  if (event.citations.length === 0) return "draft_citations_missing";
  const sourceIds = new Set(event.sources.map((source) => source.id));
  if (event.citations.some((citation) => !sourceIds.has(citation.sourceId))) return "draft_citation_source_missing";
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
    publishEvent(eventId, note, actor) {
      return eventModule.transitionEventPublication(eventId, "publish", note, actor, { repository: eventRepository });
    },
  };
}

function emptySummary(mode: AutoPublishSummary["mode"]): AutoPublishSummary {
  return { mode, scanned: 0, eligible: 0, attempted: 0, published: 0, deferred: 0, failed: 0, outcomes: [] };
}
