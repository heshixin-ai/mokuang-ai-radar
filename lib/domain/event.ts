import { z } from "zod";

export const eventTypeSchema = z.enum([
  "model_release",
  "api_change",
  "pricing",
  "policy",
  "funding",
  "research",
]);

export const evidenceLevelSchema = z.enum([
  "official",
  "corroborated",
  "reported",
  "lead_only",
]);

export const eventStatusSchema = z.enum([
  "candidate",
  "needs_review",
  "published",
  "rejected",
]);

export const roleSchema = z.enum(["product", "developer", "founder", "researcher"]);

export const sourceSchema = z.object({
  id: z.string().min(1),
  publisher: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url(),
  sourceType: z.enum(["official", "media", "research", "community"]),
  publishedAt: z.string().datetime({ offset: true }),
});

export const citationSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  claim: z.string().min(1),
  supports: z.array(z.string().min(1)).min(1),
});

export const roleImpactSchema = z.object({
  role: roleSchema,
  level: z.enum(["high", "medium", "low", "none"]),
  impact: z.string().nullable(),
});

export const eventSchema = z.object({
  id: z.string().min(1),
  eventType: eventTypeSchema,
  status: eventStatusSchema,
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
  announcedAt: z.string().datetime({ offset: true }).nullable(),
  effectiveAt: z.string().datetime({ offset: true }).nullable(),
  publishedAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  sources: z.array(sourceSchema).min(1),
  citations: z.array(citationSchema).min(1),
  promptVersion: z.string().min(1),
  modelId: z.string().min(1),
});

export const eventFilterSchema = z.object({
  type: eventTypeSchema.optional(),
  status: eventStatusSchema.optional(),
});

export const pipelinePreviewInputSchema = z.object({
  sourceDocuments: z.array(z.object({
    id: z.string().min(1),
    publisher: z.string().min(1),
    title: z.string().min(1),
    url: z.string().url(),
    sourceType: z.enum(["official", "media", "research", "community"]),
    publishedAt: z.string().datetime({ offset: true }),
    body: z.string().min(20).max(20_000),
  })).min(1).max(6),
});

export const pipelinePreviewOutputSchema = z.object({
  taskStatus: z.enum(["ok", "irrelevant", "insufficient_input"]),
  eventType: eventTypeSchema.nullable(),
  titleZh: z.string().nullable(),
  whatChanged: z.string().nullable(),
  evidenceLevel: evidenceLevelSchema.nullable(),
  sourceIds: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  needsReview: z.boolean(),
  reviewReasons: z.array(z.string()),
  promptVersion: z.string(),
  modelId: z.string(),
});

export type EventType = z.infer<typeof eventTypeSchema>;
export type EvidenceLevel = z.infer<typeof evidenceLevelSchema>;
export type EventStatus = z.infer<typeof eventStatusSchema>;
export type IntelligenceEvent = z.infer<typeof eventSchema>;
export type EventFilter = z.infer<typeof eventFilterSchema>;
export type PipelinePreviewInput = z.infer<typeof pipelinePreviewInputSchema>;
export type PipelinePreviewOutput = z.infer<typeof pipelinePreviewOutputSchema>;
