import type { PipelinePreviewOutput } from "@/lib/domain/event";
import type {
  CandidateView,
  DashboardData,
  DocumentView,
  NormalizedFeedItem,
  SourceDefinition,
} from "@/lib/ingestion/types";

export type ReviewActor = { id: string; email: string; displayName: string };
export type ReviewAction = "approve" | "reject" | "reopen";
export type RunTriggerKind = "manual" | "scheduled";
export type DueSource = { id: string; lastSuccessAt: string | null };
export type AnalysisExecutionMeta = {
  provider: "mock" | "deepseek";
  escalated: boolean;
  attempts: number;
  latencyMs: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    reasoningTokens: number;
  };
};

export interface IngestionRepository {
  syncSources(sources: SourceDefinition[], now: string): Promise<void>;
  createRun(input: {
    id: string;
    sourceId: string;
    triggerKind: RunTriggerKind;
    triggeredBy: string;
    startedAt: string;
  }): Promise<boolean>;
  finishRun(input: {
    id: string;
    completedAt: string;
    discoveredCount: number;
    insertedCount: number;
    duplicateCount: number;
  }): Promise<void>;
  failRun(input: { id: string; sourceId: string; completedAt: string; errorCode: string }): Promise<void>;
  listDueSources(now: string, limit: number): Promise<DueSource[]>;
  listPendingDocumentIds(limit: number): Promise<string[]>;
  insertDocument(input: {
    id: string;
    sourceId: string;
    item: NormalizedFeedItem;
    discoveredAt: string;
  }): Promise<boolean>;
  claimDocument(documentId: string, startedAt: string, staleBefore: string): Promise<DocumentView | null>;
  completeIrrelevant(documentId: string, analyzedAt: string): Promise<void>;
  completeCandidate(input: {
    documentId: string;
    candidateId: string;
    output: PipelinePreviewOutput;
    analysisMeta: AnalysisExecutionMeta;
    analyzedAt: string;
  }): Promise<void>;
  failAnalysis(documentId: string, failedAt: string, errorCode: string): Promise<void>;
  reviewCandidate(input: {
    candidateId: string;
    action: ReviewAction;
    note: string | null;
    actor: ReviewActor;
    reviewedAt: string;
    actionId: string;
  }): Promise<CandidateView | null>;
  getDashboard(): Promise<DashboardData>;
}
