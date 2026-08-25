import { suggestCluster } from "@/lib/clustering/similarity";
import type { ClusterDashboard, ClusterDecisionView } from "@/lib/clustering/types";
import { getD1 } from "@/db";
import { D1ClusteringRepository } from "@/lib/repository/clustering";
import type { ReviewActor } from "@/lib/repository/ingestion-contract";

export class ClusteringError extends Error {
  constructor(public readonly code: string, public readonly httpStatus: number, public readonly publicMessage: string) {
    super(code);
    this.name = "ClusteringError";
  }
}

export async function getClusterDashboard(repository = new D1ClusteringRepository(getD1())): Promise<ClusterDashboard> {
  return repository.listDashboard();
}

export async function clusterApprovedCandidate(
  candidateId: string,
  options: { repository?: D1ClusteringRepository; clock?: () => Date } = {},
): Promise<ClusterDecisionView> {
  const repository = options.repository ?? new D1ClusteringRepository(getD1());
  const existing = await repository.getByCandidateId(candidateId);
  if (existing) return existing;
  const candidate = await repository.getCandidate(candidateId);
  if (!candidate) throw new ClusteringError("CANDIDATE_NOT_CLUSTERABLE", 409, "候选未批准、已归入事件，或状态已经变化。");
  const targets = await repository.listTargets(candidateId);
  return repository.saveSuggestion(candidate, suggestCluster(candidate, targets), (options.clock ?? (() => new Date()))().toISOString());
}

export async function ensureCandidateCanCreateEvent(candidateId: string): Promise<void> {
  const decision = await clusterApprovedCandidate(candidateId);
  if (decision.action !== "create_new" || !["confirmed", "dismissed"].includes(decision.status)) {
    throw new ClusteringError("CLUSTER_REVIEW_REQUIRED", 409, "该候选可能属于已有事件，请先处理合并建议。");
  }
}

export async function reviewClusterDecision(
  decisionId: string,
  action: "confirm_merge" | "keep_separate",
  note: string | null,
  actor: ReviewActor,
  options: { repository?: D1ClusteringRepository; clock?: () => Date } = {},
): Promise<ClusterDecisionView> {
  const repository = options.repository ?? new D1ClusteringRepository(getD1());
  const decision = await repository.reviewDecision({
    decisionId,
    action,
    note,
    actor,
    now: (options.clock ?? (() => new Date()))().toISOString(),
  });
  if (!decision) throw new ClusteringError("CLUSTER_STATE_CONFLICT", 409, "合并建议状态已经变化，请刷新后重试。");
  return decision;
}
