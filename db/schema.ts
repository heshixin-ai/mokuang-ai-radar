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

export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    candidateId: text("candidate_id").notNull().references(() => eventCandidates.id),
    status: text("status", { enum: ["draft", "published", "withdrawn"] }).notNull().default("draft"),
    eventType: text("event_type", {
      enum: ["model_release", "api_change", "pricing", "policy", "funding", "research"],
    }).notNull(),
    titleZh: text("title_zh").notNull(),
    deckZh: text("deck_zh").notNull(),
    whatChanged: text("what_changed").notNull(),
    beforeText: text("before_text"),
    afterText: text("after_text"),
    whyItMatters: text("why_it_matters").notNull(),
    recommendedAction: text("recommended_action"),
    affectedRolesJson: text("affected_roles_json").notNull(),
    evidenceLevel: text("evidence_level", {
      enum: ["official", "corroborated", "reported", "lead_only"],
    }).notNull(),
    confidence: real("confidence").notNull(),
    needsReview: integer("needs_review", { mode: "boolean" }).notNull(),
    reviewReasonsJson: text("review_reasons_json").notNull(),
    announcedAt: text("announced_at"),
    effectiveAt: text("effective_at"),
    qualityStatus: text("quality_status", { enum: ["blocked", "ready"] }).notNull(),
    qualityIssuesJson: text("quality_issues_json").notNull(),
    promptVersion: text("prompt_version").notNull(),
    modelId: text("model_id").notNull(),
    provider: text("provider").notNull(),
    attempts: integer("attempts").notNull().default(0),
    latencyMs: integer("latency_ms").notNull().default(0),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    reasoningTokens: integer("reasoning_tokens").notNull().default(0),
    publishedAt: text("published_at"),
    publishedBy: text("published_by"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_events_candidate").on(table.candidateId),
    index("idx_events_status_updated").on(table.status, table.updatedAt),
    index("idx_events_published_at").on(table.publishedAt),
  ],
);

export const eventSources = sqliteTable(
  "event_sources",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull().references(() => events.id),
    documentId: text("document_id").notNull().references(() => sourceDocuments.id),
    isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_event_sources_event_document").on(table.eventId, table.documentId),
    index("idx_event_sources_document").on(table.documentId),
  ],
);

export const eventCitations = sqliteTable(
  "event_citations",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull().references(() => events.id),
    documentId: text("document_id").notNull().references(() => sourceDocuments.id),
    claim: text("claim").notNull(),
    supportsJson: text("supports_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_event_citations_event").on(table.eventId),
    index("idx_event_citations_document").on(table.documentId),
  ],
);

export const publicationActions = sqliteTable(
  "publication_actions",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull().references(() => events.id),
    action: text("action", { enum: ["draft_created", "revised", "published", "withdrawn"] }).notNull(),
    actorId: text("actor_id").notNull(),
    actorEmail: text("actor_email").notNull(),
    note: text("note"),
    snapshotJson: text("snapshot_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_publication_actions_event_created").on(table.eventId, table.createdAt)],
);

export const eventRevisions = sqliteTable(
  "event_revisions",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull().references(() => events.id),
    revisionNumber: integer("revision_number").notNull(),
    actorId: text("actor_id").notNull(),
    actorEmail: text("actor_email").notNull(),
    note: text("note").notNull(),
    snapshotJson: text("snapshot_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_event_revisions_event_number").on(table.eventId, table.revisionNumber),
    index("idx_event_revisions_event_created").on(table.eventId, table.createdAt),
  ],
);

export const entities = sqliteTable(
  "entities",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    kind: text("kind", { enum: ["company", "project", "model"] }).notNull(),
    description: text("description").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("idx_entities_slug").on(table.slug)],
);

export const eventEntities = sqliteTable(
  "event_entities",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull().references(() => events.id),
    entityId: text("entity_id").notNull().references(() => entities.id),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_event_entities_event_entity").on(table.eventId, table.entityId),
    index("idx_event_entities_entity").on(table.entityId),
  ],
);

export const eventTopics = sqliteTable(
  "event_topics",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull().references(() => events.id),
    slug: text("slug").notNull(),
    label: text("label").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_event_topics_event_slug").on(table.eventId, table.slug),
    index("idx_event_topics_slug").on(table.slug),
  ],
);

export const candidateClusters = sqliteTable(
  "candidate_clusters",
  {
    id: text("id").primaryKey(),
    candidateId: text("candidate_id").notNull().references(() => eventCandidates.id),
    action: text("action", { enum: ["create_new", "merge_suggested", "manual_review"] }).notNull(),
    targetEventId: text("target_event_id").references(() => events.id),
    similarity: real("similarity").notNull(),
    reasonsJson: text("reasons_json").notNull(),
    status: text("status", { enum: ["proposed", "confirmed", "dismissed"] }).notNull(),
    decidedBy: text("decided_by", { enum: ["rules", "reviewer"] }).notNull(),
    reviewedAt: text("reviewed_at"),
    reviewedBy: text("reviewed_by"),
    reviewNote: text("review_note"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_candidate_clusters_candidate").on(table.candidateId),
    index("idx_candidate_clusters_status_created").on(table.status, table.createdAt),
    index("idx_candidate_clusters_target").on(table.targetEventId),
  ],
);

export const eventCandidateLinks = sqliteTable(
  "event_candidate_links",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull().references(() => events.id),
    candidateId: text("candidate_id").notNull().references(() => eventCandidates.id),
    linkKind: text("link_kind", { enum: ["primary", "supporting"] }).notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_event_candidate_links_candidate").on(table.candidateId),
    index("idx_event_candidate_links_event").on(table.eventId),
  ],
);
