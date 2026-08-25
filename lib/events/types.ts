import { z } from "zod";
import { citationSchema, eventTypeSchema, evidenceLevelSchema, roleImpactSchema, sourceSchema } from "@/lib/domain/event";

export const eventWorkflowStatusSchema = z.enum(["draft", "published", "withdrawn"]);
export const eventQualityStatusSchema = z.enum(["blocked", "ready"]);

export const eventAdminViewSchema = z.object({
  id: z.string().min(1),
  candidateId: z.string().min(1),
  status: eventWorkflowStatusSchema,
  eventType: eventTypeSchema,
  titleZh: z.string().min(1),
  deckZh: z.string().min(1),
  whatChanged: z.string().min(1),
  before: z.string().nullable(),
  after: z.string().nullable(),
  whyItMatters: z.string().min(1),
  recommendedAction: z.string().nullable(),
  affectedRoles: z.array(roleImpactSchema),
  evidenceLevel: evidenceLevelSchema,
  confidence: z.number().min(0).max(1),
  needsReview: z.boolean(),
  reviewReasons: z.array(z.string()),
  announcedAt: z.string().nullable(),
  effectiveAt: z.string().nullable(),
  qualityStatus: eventQualityStatusSchema,
  qualityIssues: z.array(z.string()),
  promptVersion: z.string().min(1),
  modelId: z.string().min(1),
  provider: z.string().min(1),
  attempts: z.number().int().nonnegative(),
  latencyMs: z.number().int().nonnegative(),
  usage: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
    reasoningTokens: z.number().int().nonnegative(),
  }),
  publishedAt: z.string().nullable(),
  publishedBy: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  sources: z.array(sourceSchema).min(1),
  citations: z.array(citationSchema).min(1),
});

export const eventAdminDashboardSchema = z.object({
  events: z.array(eventAdminViewSchema),
  counts: z.object({
    draft: z.number().int().nonnegative(),
    ready: z.number().int().nonnegative(),
    published: z.number().int().nonnegative(),
    withdrawn: z.number().int().nonnegative(),
  }),
});

export type EventWorkflowStatus = z.infer<typeof eventWorkflowStatusSchema>;
export type EventQualityStatus = z.infer<typeof eventQualityStatusSchema>;
export type EventAdminView = z.infer<typeof eventAdminViewSchema>;
export type EventAdminDashboard = z.infer<typeof eventAdminDashboardSchema>;

export type ApprovedCandidateMaterial = {
  candidate: {
    id: string;
    eventType: z.infer<typeof eventTypeSchema>;
    titleZh: string;
    whatChanged: string;
    evidenceLevel: z.infer<typeof evidenceLevelSchema>;
    confidence: number;
    reviewNote: string | null;
    reviewedAt: string;
    reviewedBy: string;
    promptVersion: string;
    modelId: string;
  };
  document: {
    id: string;
    publisher: string;
    sourceType: "official" | "media" | "research" | "community";
    title: string;
    url: string;
    publishedAt: string;
    body: string;
  };
};
