import { z } from "zod";
import { evidenceLevelSchema, eventTypeSchema } from "../domain/event";

const nullableIsoDateSchema = z.union([
  z.string().datetime({ offset: true }),
  z.string().date(),
]).nullable();

export const extractionCandidateSchema = z.object({
  candidate_id: z.string().min(1),
  source_id: z.string().min(1),
  event_type: eventTypeSchema,
  subject: z.object({
    name: z.string().min(1),
    type: z.enum(["company", "model", "api", "product", "policy", "paper"]),
  }).strict(),
  change_statement: z.string().min(1),
  before: z.string().nullable(),
  after: z.string().nullable(),
  announced_at: nullableIsoDateSchema,
  effective_at: nullableIsoDateSchema,
  entities: z.array(z.string().min(1)),
  evidence_spans: z.array(z.object({
    source_id: z.string().min(1),
    quote: z.string().min(1).max(600),
    supports: z.array(z.string().min(1)).min(1),
  }).strict()).min(1),
  evidence_level: evidenceLevelSchema,
  injection_suspected: z.boolean(),
  confidence: z.number().min(0).max(1),
  needs_review: z.boolean(),
  review_reasons: z.array(z.string().min(1)),
}).strict();

export const extractionOutputSchema = z.object({
  task_status: z.enum(["ok", "irrelevant", "insufficient_input"]),
  candidates: z.array(extractionCandidateSchema).max(18),
}).strict().superRefine((value, context) => {
  if (value.task_status === "ok" && value.candidates.length === 0) {
    context.addIssue({ code: "custom", path: ["candidates"], message: "ok requires candidates" });
  }
  if (value.task_status !== "ok" && value.candidates.length > 0) {
    context.addIssue({ code: "custom", path: ["candidates"], message: "failure status requires no candidates" });
  }
});

export const mergeDecisionSchema = z.object({
  candidate_id: z.string().min(1),
  action: z.enum(["create_new", "merge_into", "manual_review", "discard_duplicate"]),
  target_event_id: z.string().nullable(),
  canonical_subject: z.string().min(1),
  canonical_change_key: z.string().min(1),
  matched_source_ids: z.array(z.string().min(1)).min(1),
  conflict: z.boolean(),
  conflict_fields: z.array(z.string().min(1)),
  evidence_level: evidenceLevelSchema,
  confidence: z.number().min(0).max(1),
  needs_review: z.boolean(),
  review_reasons: z.array(z.string().min(1)),
}).strict();

export const mergingOutputSchema = z.object({
  task_status: z.enum(["ok", "insufficient_input"]),
  decisions: z.array(mergeDecisionSchema).max(18),
}).strict().superRefine((value, context) => {
  if (value.task_status === "ok" && value.decisions.length === 0) {
    context.addIssue({ code: "custom", path: ["decisions"], message: "ok requires decisions" });
  }
});

export type ExtractionCandidate = z.infer<typeof extractionCandidateSchema>;
export type ExtractionOutput = z.infer<typeof extractionOutputSchema>;
export type MergeDecision = z.infer<typeof mergeDecisionSchema>;
export type MergingOutput = z.infer<typeof mergingOutputSchema>;

const nullableStringJsonSchema = { type: ["string", "null"] } as const;

export const extractionJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["task_status", "candidates"],
  properties: {
    task_status: { type: "string", enum: ["ok", "irrelevant", "insufficient_input"] },
    candidates: {
      type: "array",
      maxItems: 18,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "candidate_id", "source_id", "event_type", "subject", "change_statement",
          "before", "after", "announced_at", "effective_at", "entities",
          "evidence_spans", "evidence_level", "injection_suspected", "confidence",
          "needs_review", "review_reasons",
        ],
        properties: {
          candidate_id: { type: "string", minLength: 1 },
          source_id: { type: "string", minLength: 1 },
          event_type: {
            type: "string",
            enum: ["model_release", "api_change", "pricing", "policy", "funding", "research"],
          },
          subject: {
            type: "object",
            additionalProperties: false,
            required: ["name", "type"],
            properties: {
              name: { type: "string", minLength: 1 },
              type: { type: "string", enum: ["company", "model", "api", "product", "policy", "paper"] },
            },
          },
          change_statement: { type: "string", minLength: 1 },
          before: nullableStringJsonSchema,
          after: nullableStringJsonSchema,
          announced_at: nullableStringJsonSchema,
          effective_at: nullableStringJsonSchema,
          entities: { type: "array", items: { type: "string", minLength: 1 } },
          evidence_spans: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["source_id", "quote", "supports"],
              properties: {
                source_id: { type: "string", minLength: 1 },
                quote: { type: "string", minLength: 1, maxLength: 600 },
                supports: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
              },
            },
          },
          evidence_level: { type: "string", enum: ["official", "corroborated", "reported", "lead_only"] },
          injection_suspected: { type: "boolean" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          needs_review: { type: "boolean" },
          review_reasons: { type: "array", items: { type: "string", minLength: 1 } },
        },
      },
    },
  },
} as const;

export const mergingJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["task_status", "decisions"],
  properties: {
    task_status: { type: "string", enum: ["ok", "insufficient_input"] },
    decisions: {
      type: "array",
      maxItems: 18,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "candidate_id", "action", "target_event_id", "canonical_subject",
          "canonical_change_key", "matched_source_ids", "conflict", "conflict_fields",
          "evidence_level", "confidence", "needs_review", "review_reasons",
        ],
        properties: {
          candidate_id: { type: "string", minLength: 1 },
          action: { type: "string", enum: ["create_new", "merge_into", "manual_review", "discard_duplicate"] },
          target_event_id: nullableStringJsonSchema,
          canonical_subject: { type: "string", minLength: 1 },
          canonical_change_key: { type: "string", minLength: 1 },
          matched_source_ids: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
          conflict: { type: "boolean" },
          conflict_fields: { type: "array", items: { type: "string", minLength: 1 } },
          evidence_level: { type: "string", enum: ["official", "corroborated", "reported", "lead_only"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          needs_review: { type: "boolean" },
          review_reasons: { type: "array", items: { type: "string", minLength: 1 } },
        },
      },
    },
  },
} as const;
