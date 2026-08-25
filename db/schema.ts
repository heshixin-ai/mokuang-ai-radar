import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const sources = sqliteTable(
  "sources",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    homepageUrl: text("homepage_url").notNull(),
    feedUrl: text("feed_url").notNull(),
    sourceType: text("source_type", { enum: ["official", "media", "research", "community"] }).notNull(),
    fetchMethod: text("fetch_method", { enum: ["rss", "atom", "html"] }).notNull(),
    status: text("status", { enum: ["active", "paused"] }).notNull().default("active"),
    priority: integer("priority").notNull().default(100),
    frequencyMinutes: integer("frequency_minutes").notNull().default(30),
    allowedHostsJson: text("allowed_hosts_json").notNull(),
    authorizationStatus: text("authorization_status", {
      enum: ["approved", "pending", "restricted"],
    }).notNull(),
    termsNote: text("terms_note").notNull(),
    robotsNote: text("robots_note").notNull(),
    lastAttemptAt: text("last_attempt_at"),
    lastSuccessAt: text("last_success_at"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    lastErrorCode: text("last_error_code"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_sources_feed_url").on(table.feedUrl),
    index("idx_sources_status_priority").on(table.status, table.priority),
  ],
);

export const ingestionRuns = sqliteTable(
  "ingestion_runs",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id").notNull().references(() => sources.id),
    status: text("status", { enum: ["running", "succeeded", "failed"] }).notNull(),
    triggerKind: text("trigger_kind", { enum: ["manual", "scheduled"] }).notNull(),
    triggeredBy: text("triggered_by").notNull(),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at"),
    discoveredCount: integer("discovered_count").notNull().default(0),
    insertedCount: integer("inserted_count").notNull().default(0),
    duplicateCount: integer("duplicate_count").notNull().default(0),
    errorCode: text("error_code"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_ingestion_runs_source_started").on(table.sourceId, table.startedAt),
    index("idx_ingestion_runs_status_started").on(table.status, table.startedAt),
  ],
);

export const sourceDocuments = sqliteTable(
  "source_documents",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id").notNull().references(() => sources.id),
    externalId: text("external_id").notNull(),
    canonicalUrl: text("canonical_url").notNull(),
    title: text("title").notNull(),
    author: text("author"),
    publishedAt: text("published_at").notNull(),
    discoveredAt: text("discovered_at").notNull(),
    contentExcerpt: text("content_excerpt").notNull(),
    contentHash: text("content_hash").notNull(),
    status: text("status", {
      enum: ["pending_analysis", "analyzing", "candidate_created", "irrelevant", "analysis_failed"],
    }).notNull(),
    analysisStartedAt: text("analysis_started_at"),
    analyzedAt: text("analyzed_at"),
    analysisErrorCode: text("analysis_error_code"),
    candidateId: text("candidate_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_source_documents_canonical_url").on(table.canonicalUrl),
    uniqueIndex("idx_source_documents_source_external").on(table.sourceId, table.externalId),
    index("idx_source_documents_status_discovered").on(table.status, table.discoveredAt),
    index("idx_source_documents_source_published").on(table.sourceId, table.publishedAt),
  ],
);

export const eventCandidates = sqliteTable(
  "event_candidates",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id").notNull().references(() => sourceDocuments.id),
    reviewStatus: text("review_status", { enum: ["pending", "approved", "rejected"] }).notNull(),
    eventType: text("event_type", {
      enum: ["model_release", "api_change", "pricing", "policy", "funding", "research"],
    }).notNull(),
    titleZh: text("title_zh").notNull(),
    whatChanged: text("what_changed").notNull(),
    evidenceLevel: text("evidence_level", {
      enum: ["official", "corroborated", "reported", "lead_only"],
    }).notNull(),
    confidence: real("confidence").notNull(),
    needsReview: integer("needs_review", { mode: "boolean" }).notNull(),
    reviewReasonsJson: text("review_reasons_json").notNull(),
    sourceIdsJson: text("source_ids_json").notNull(),
    promptVersion: text("prompt_version").notNull(),
    modelId: text("model_id").notNull(),
    provider: text("provider").notNull().default("unknown"),
    escalated: integer("escalated", { mode: "boolean" }).notNull().default(false),
    attempts: integer("attempts").notNull().default(0),
    latencyMs: integer("latency_ms").notNull().default(0),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    reasoningTokens: integer("reasoning_tokens").notNull().default(0),
    reviewedAt: text("reviewed_at"),
    reviewedBy: text("reviewed_by"),
    reviewNote: text("review_note"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_event_candidates_document").on(table.documentId),
    index("idx_event_candidates_review_created").on(table.reviewStatus, table.createdAt),
  ],
);

export const reviewActions = sqliteTable(
  "review_actions",
  {
    id: text("id").primaryKey(),
    candidateId: text("candidate_id").notNull().references(() => eventCandidates.id),
    action: text("action", { enum: ["approved", "rejected", "reopened"] }).notNull(),
    actorId: text("actor_id").notNull(),
    actorEmail: text("actor_email").notNull(),
    note: text("note"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_review_actions_candidate_created").on(table.candidateId, table.createdAt)],
);
