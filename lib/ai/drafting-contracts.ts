import { z } from "zod";
import { evidenceLevelSchema, roleSchema } from "@/lib/domain/event";

export const impactAnalysisOutputSchema = z.object({
  task_status: z.enum(["ok", "insufficient_evidence"]),
  affected_roles: z.array(z.object({
    role: roleSchema,
    impact_level: z.enum(["high", "medium", "low", "none"]),
    impact: z.string().nullable(),
    inference_basis: z.array(z.string().min(1)),
  }).strict()).max(4),
  recommended_action: z.string().nullable(),
  action_owner: z.enum(["product", "engineering", "founder", "research"]).nullable(),
  action_urgency: z.enum(["now", "this_week", "monitor", "none"]),
  assumptions: z.array(z.string().min(1)),
  confidence: z.number().min(0).max(1),
  needs_review: z.boolean(),
  review_reasons: z.array(z.string().min(1)),
}).strict();

export const intelligenceDraftOutputSchema = z.object({
  event_id: z.string().min(1),
  title_zh: z.string().min(1).max(80),
  deck_zh: z.string().min(1).max(200),
  what_changed: z.string().min(1),
  why_it_matters: z.string().min(1),
  affected_roles: z.array(roleSchema).max(4),
  recommended_action: z.string().nullable(),
  evidence_level: evidenceLevelSchema,
  claims: z.array(z.object({
    text: z.string().min(1),
    source_ids: z.array(z.string().min(1)).min(1),
  }).strict()).min(1),
  confidence: z.number().min(0).max(1),
  needs_review: z.boolean(),
  review_reasons: z.array(z.string().min(1)),
}).strict();

export type ImpactAnalysisOutput = z.infer<typeof impactAnalysisOutputSchema>;
export type IntelligenceDraftOutput = z.infer<typeof intelligenceDraftOutputSchema>;

const nullableString = { type: ["string", "null"] } as const;

export const impactAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "task_status", "affected_roles", "recommended_action", "action_owner",
    "action_urgency", "assumptions", "confidence", "needs_review", "review_reasons",
  ],
  properties: {
    task_status: { type: "string", enum: ["ok", "insufficient_evidence"] },
    affected_roles: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["role", "impact_level", "impact", "inference_basis"],
        properties: {
          role: { type: "string", enum: ["product", "developer", "founder", "researcher"] },
          impact_level: { type: "string", enum: ["high", "medium", "low", "none"] },
          impact: nullableString,
          inference_basis: { type: "array", items: { type: "string", minLength: 1 } },
        },
      },
    },
    recommended_action: nullableString,
    action_owner: { type: ["string", "null"], enum: ["product", "engineering", "founder", "research", null] },
    action_urgency: { type: "string", enum: ["now", "this_week", "monitor", "none"] },
    assumptions: { type: "array", items: { type: "string", minLength: 1 } },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    needs_review: { type: "boolean" },
    review_reasons: { type: "array", items: { type: "string", minLength: 1 } },
  },
} as const;

export const intelligenceDraftJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "event_id", "title_zh", "deck_zh", "what_changed", "why_it_matters",
    "affected_roles", "recommended_action", "evidence_level", "claims",
    "confidence", "needs_review", "review_reasons",
  ],
  properties: {
    event_id: { type: "string", minLength: 1 },
    title_zh: { type: "string", minLength: 1, maxLength: 80 },
    deck_zh: { type: "string", minLength: 1, maxLength: 200 },
    what_changed: { type: "string", minLength: 1 },
    why_it_matters: { type: "string", minLength: 1 },
    affected_roles: {
      type: "array",
      maxItems: 4,
      items: { type: "string", enum: ["product", "developer", "founder", "researcher"] },
    },
    recommended_action: nullableString,
    evidence_level: { type: "string", enum: ["official", "corroborated", "reported", "lead_only"] },
    claims: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "source_ids"],
        properties: {
          text: { type: "string", minLength: 1 },
          source_ids: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
        },
      },
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    needs_review: { type: "boolean" },
    review_reasons: { type: "array", items: { type: "string", minLength: 1 } },
  },
} as const;
