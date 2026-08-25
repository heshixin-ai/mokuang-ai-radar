import { readAiConfig, type AiConfig } from "@/lib/ai/config";
import { generateEventDraft } from "@/lib/ai/drafting";
import { AiPipelineError } from "@/lib/ai/errors";
import { evaluateDraftQuality } from "@/lib/events/quality";
import { ClusteringError, ensureCandidateCanCreateEvent } from "@/lib/clustering/service";
import type { EventAdminDashboard, EventAdminView } from "@/lib/events/types";
import { getD1 } from "@/db";
import { D1EventWorkflowRepository } from "@/lib/repository/event-workflow";
import type { ReviewActor } from "@/lib/repository/ingestion-contract";

export class EventWorkflowError extends Error {
  constructor(
    public readonly code: string,
    public readonly httpStatus: number,
    public readonly publicMessage: string,
  ) {
    super(code);
    this.name = "EventWorkflowError";
  }
}

export async function getEventAdminDashboard(
  repository: D1EventWorkflowRepository = new D1EventWorkflowRepository(getD1()),
): Promise<EventAdminDashboard> {
  return repository.listAdminDashboard();
}

export async function createEventDraft(
  candidateId: string,
  actor: ReviewActor,
  options: {
    repository?: D1EventWorkflowRepository;
    config?: AiConfig;
    clock?: () => Date;
  } = {},
): Promise<EventAdminView> {
  const repository = options.repository ?? new D1EventWorkflowRepository(getD1());
  const existing = await repository.getByCandidateId(candidateId);
  if (existing) return existing;
  try {
    await ensureCandidateCanCreateEvent(candidateId);
  } catch (error) {
    if (error instanceof ClusteringError) {
      throw new EventWorkflowError(error.code, error.httpStatus, error.publicMessage);
    }
    throw error;
  }
  const material = await repository.getApprovedCandidateMaterial(candidateId);
  if (!material) {
    throw new EventWorkflowError("CANDIDATE_NOT_APPROVED", 409, "只有已批准候选才能生成正式事件草稿。");
  }
  try {
    const result = await generateEventDraft(material, options.config ?? readAiConfig(), {
      now: (options.clock ?? (() => new Date()))(),
    });
    const quality = evaluateDraftQuality(material, result);
    const now = (options.clock ?? (() => new Date()))().toISOString();
    return repository.saveDraft({
      material,
      result,
      quality,
      actor,
      now,
      actionId: `pub_${crypto.randomUUID()}`,
    });
  } catch (error) {
    if (error instanceof EventWorkflowError) throw error;
    if (error instanceof AiPipelineError) {
      throw new EventWorkflowError(error.code, error.httpStatus, error.publicMessage);
    }
    throw new EventWorkflowError("DRAFT_GENERATION_FAILED", 500, "正式事件草稿生成失败，候选内容仍已保留。");
  }
}

export async function transitionEventPublication(
  eventId: string,
  action: "publish" | "withdraw",
  note: string | null,
  actor: ReviewActor,
  options: { repository?: D1EventWorkflowRepository; clock?: () => Date } = {},
): Promise<EventAdminView> {
  const repository = options.repository ?? new D1EventWorkflowRepository(getD1());
  const event = await repository.transitionPublication({
    eventId,
    action,
    note,
    actor,
    now: (options.clock ?? (() => new Date()))().toISOString(),
    actionId: `pub_${crypto.randomUUID()}`,
  });
  if (!event) {
    throw new EventWorkflowError(
      action === "publish" ? "PUBLICATION_GATE_BLOCKED" : "PUBLICATION_STATE_CONFLICT",
      409,
      action === "publish"
        ? "草稿未通过质量门禁，或状态已经变化，暂不能发布。"
        : "事件不是已发布状态，无法撤下。",
    );
  }
  return event;
}
