import { z } from "zod";
import { evidenceLevelSchema, eventTypeSchema } from "@/lib/domain/event";

export const sourceDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  homepageUrl: z.string().url(),
  feedUrl: z.string().url(),
  sourceType: z.enum(["official", "media", "research", "community"]),
  fetchMethod: z.enum(["rss", "atom"]),
  status: z.enum(["active", "paused"]),
  priority: z.number().int().positive(),
  frequencyMinutes: z.number().int().min(5),
  allowedHosts: z.array(z.string().min(1)).min(1),
  authorizationStatus: z.enum(["approved", "pending", "restricted"]),
  termsNote: z.string().min(1),
  robotsNote: z.string().min(1),
});

export const normalizedFeedItemSchema = z.object({
  externalId: z.string().min(1),
  canonicalUrl: z.string().url(),
  title: z.string().min(1).max(500),
  author: z.string().max(300).nullable(),
  publishedAt: z.string().datetime({ offset: true }),
  contentExcerpt: z.string().min(20).max(4_000),
  contentHash: z.string().min(16),
});

export const documentStatusSchema = z.enum([
  "pending_analysis",
  "analyzing",
  "candidate_created",
  "irrelevant",
  "analysis_failed",
]);

export const reviewStatusSchema = z.enum(["pending", "approved", "rejected"]);

export const sourceViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  homepageUrl: z.string().url(),
  feedUrl: z.string().url(),
  sourceType: z.string(),
  status: z.string(),
  authorizationStatus: z.string(),
  frequencyMinutes: z.number().int(),
  lastAttemptAt: z.string().nullable(),
  lastSuccessAt: z.string().nullable(),
  consecutiveFailures: z.number().int(),
  lastErrorCode: z.string().nullable(),
});

export const documentViewSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  sourceName: z.string(),
  canonicalUrl: z.string().url(),
  title: z.string(),
  author: z.string().nullable(),
  publishedAt: z.string(),
  discoveredAt: z.string(),
  contentExcerpt: z.string(),
  status: documentStatusSchema,
  analysisErrorCode: z.string().nullable(),
});

export const candidateViewSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  sourceName: z.string(),
  canonicalUrl: z.string().url(),
  sourceTitle: z.string(),
  publishedAt: z.string(),
  reviewStatus: reviewStatusSchema,
  eventType: eventTypeSchema,
  titleZh: z.string(),
  whatChanged: z.string(),
  evidenceLevel: evidenceLevelSchema,
  confidence: z.number().min(0).max(1),
  needsReview: z.boolean(),
  reviewReasons: z.array(z.string()),
  sourceIds: z.array(z.string()),
  promptVersion: z.string(),
  modelId: z.string(),
  provider: z.string(),
  escalated: z.boolean(),
  attempts: z.number().int().nonnegative(),
  latencyMs: z.number().int().nonnegative(),
  usage: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
    reasoningTokens: z.number().int().nonnegative(),
  }),
  reviewedAt: z.string().nullable(),
  reviewedBy: z.string().nullable(),
  reviewNote: z.string().nullable(),
  createdAt: z.string(),
});

export const ingestionRunViewSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  sourceName: z.string(),
  status: z.enum(["running", "succeeded", "failed"]),
  triggerKind: z.enum(["manual", "scheduled"]),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  discoveredCount: z.number().int(),
  insertedCount: z.number().int(),
  duplicateCount: z.number().int(),
  errorCode: z.string().nullable(),
});

export const dashboardDataSchema = z.object({
  sources: z.array(sourceViewSchema),
  pendingDocuments: z.array(documentViewSchema),
  candidates: z.array(candidateViewSchema),
  recentRuns: z.array(ingestionRunViewSchema),
  counts: z.object({
    pendingAnalysis: z.number().int(),
    pendingReview: z.number().int(),
    approved: z.number().int(),
    rejected: z.number().int(),
  }),
});

export type SourceDefinition = z.infer<typeof sourceDefinitionSchema>;
export type NormalizedFeedItem = z.infer<typeof normalizedFeedItemSchema>;
export type DocumentStatus = z.infer<typeof documentStatusSchema>;
export type ReviewStatus = z.infer<typeof reviewStatusSchema>;
export type SourceView = z.infer<typeof sourceViewSchema>;
export type DocumentView = z.infer<typeof documentViewSchema>;
export type CandidateView = z.infer<typeof candidateViewSchema>;
export type IngestionRunView = z.infer<typeof ingestionRunViewSchema>;
export type DashboardData = z.infer<typeof dashboardDataSchema>;
