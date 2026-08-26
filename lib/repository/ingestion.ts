import {
  candidateViewSchema,
  dashboardDataSchema,
  documentViewSchema,
  ingestionRunViewSchema,
  sourceViewSchema,
  type CandidateView,
  type DashboardData,
  type DocumentView,
  type NormalizedFeedItem,
  type SourceDefinition,
} from "@/lib/ingestion/types";
import type { PipelinePreviewOutput } from "@/lib/domain/event";
import type { AnalysisExecutionMeta, DueSource, IngestionRepository, ReviewAction, ReviewActor, RunTriggerKind } from "./ingestion-contract";

export type { IngestionRepository, ReviewAction, ReviewActor } from "./ingestion-contract";

export function createD1IngestionRepository(database: D1Database): IngestionRepository {
  return new D1IngestionRepository(database);
}

class D1IngestionRepository implements IngestionRepository {
  constructor(private readonly database: D1Database) {}

  async syncSources(sourceDefinitions: SourceDefinition[], now: string): Promise<void> {
    if (sourceDefinitions.length === 0) return;
    await this.database.batch(sourceDefinitions.map((source) => this.database.prepare(`
      INSERT INTO sources (
        id, name, homepage_url, feed_url, source_type, fetch_method, status, priority,
        frequency_minutes, allowed_hosts_json, authorization_status, terms_note, robots_note,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        homepage_url = excluded.homepage_url,
        feed_url = excluded.feed_url,
        source_type = excluded.source_type,
        fetch_method = excluded.fetch_method,
        status = excluded.status,
        priority = excluded.priority,
        frequency_minutes = excluded.frequency_minutes,
        allowed_hosts_json = excluded.allowed_hosts_json,
        authorization_status = excluded.authorization_status,
        terms_note = excluded.terms_note,
        robots_note = excluded.robots_note,
        updated_at = excluded.updated_at
    `).bind(
      source.id,
      source.name,
      source.homepageUrl,
      source.feedUrl,
      source.sourceType,
      source.fetchMethod,
      source.status,
      source.priority,
      source.frequencyMinutes,
      JSON.stringify(source.allowedHosts),
      source.authorizationStatus,
      source.termsNote,
      source.robotsNote,
      now,
      now,
    )));
  }

  async createRun(input: {
    id: string;
    sourceId: string;
    triggerKind: RunTriggerKind;
    triggeredBy: string;
    startedAt: string;
  }): Promise<boolean> {
    const result = await this.database.prepare(`
      INSERT INTO ingestion_runs (
        id, source_id, status, trigger_kind, triggered_by, started_at, created_at
      )
      SELECT ?, s.id, 'running', ?, ?, ?, ?
      FROM sources s
      WHERE s.id = ?
        AND (
          ? = 'manual'
          OR (
            s.status = 'active'
            AND s.authorization_status = 'approved'
            AND (
              s.last_attempt_at IS NULL
              OR datetime(s.last_attempt_at, '+' || s.frequency_minutes || ' minutes') <= datetime(?)
            )
          )
        )
        AND NOT EXISTS (
          SELECT 1 FROM ingestion_runs active_run
          WHERE active_run.source_id = s.id
            AND active_run.status = 'running'
            AND datetime(active_run.started_at) > datetime(?, '-15 minutes')
        )
    `).bind(
      input.id,
      input.triggerKind,
      input.triggeredBy,
      input.startedAt,
      input.startedAt,
      input.sourceId,
      input.triggerKind,
      input.startedAt,
      input.startedAt,
    ).run();
    if (Number(result.meta.changes ?? 0) === 0) return false;
    await this.database.prepare(`
      UPDATE sources
      SET last_attempt_at = ?, updated_at = ?
      WHERE id = ?
    `).bind(input.startedAt, input.startedAt, input.sourceId).run();
    return true;
  }

  async finishRun(input: {
    id: string;
    completedAt: string;
    discoveredCount: number;
    insertedCount: number;
    duplicateCount: number;
  }): Promise<void> {
    const sourceRow = await this.database.prepare("SELECT source_id FROM ingestion_runs WHERE id = ?")
      .bind(input.id).first<{ source_id: string }>();
    if (!sourceRow) throw new Error("Ingestion run not found");
    await this.database.batch([
      this.database.prepare(`
        UPDATE ingestion_runs
        SET status = 'succeeded', completed_at = ?, discovered_count = ?, inserted_count = ?, duplicate_count = ?
        WHERE id = ? AND status = 'running'
      `).bind(input.completedAt, input.discoveredCount, input.insertedCount, input.duplicateCount, input.id),
      this.database.prepare(`
        UPDATE sources
        SET last_success_at = ?, consecutive_failures = 0, last_error_code = NULL, updated_at = ?
        WHERE id = ?
      `).bind(input.completedAt, input.completedAt, sourceRow.source_id),
    ]);
  }

  async failRun(input: { id: string; sourceId: string; completedAt: string; errorCode: string }): Promise<void> {
    await this.database.batch([
      this.database.prepare(`
        UPDATE ingestion_runs
        SET status = 'failed', completed_at = ?, error_code = ?
        WHERE id = ? AND status = 'running'
      `).bind(input.completedAt, input.errorCode, input.id),
      this.database.prepare(`
        UPDATE sources
        SET consecutive_failures = consecutive_failures + 1, last_error_code = ?, updated_at = ?
        WHERE id = ?
      `).bind(input.errorCode, input.completedAt, input.sourceId),
    ]);
  }

  async listDueSources(now: string, limit: number): Promise<DueSource[]> {
    const rows = await this.database.prepare(`
      SELECT s.id, s.last_success_at
      FROM sources s
      WHERE s.status = 'active'
        AND s.authorization_status = 'approved'
        AND (
          s.last_attempt_at IS NULL
          OR datetime(s.last_attempt_at, '+' || s.frequency_minutes || ' minutes') <= datetime(?)
        )
        AND NOT EXISTS (
          SELECT 1 FROM ingestion_runs active_run
          WHERE active_run.source_id = s.id
            AND active_run.status = 'running'
            AND datetime(active_run.started_at) > datetime(?, '-15 minutes')
        )
      ORDER BY
        CASE WHEN s.last_attempt_at IS NULL THEN 0 ELSE 1 END ASC,
        datetime(s.last_attempt_at) ASC,
        s.priority ASC,
        s.id ASC
      LIMIT ?
    `).bind(now, now, limit).all<{ id: string; last_success_at: string | null }>();
    return rows.results.map((row) => ({ id: row.id, lastSuccessAt: row.last_success_at ?? null }));
  }

  async listPendingDocumentIds(limit: number): Promise<string[]> {
    const rows = await this.database.prepare(`
      SELECT id FROM source_documents
      WHERE status IN ('pending_analysis', 'analysis_failed')
      ORDER BY
        CASE WHEN source_id IN (
          'src-deepseek-api-changelog',
          'src-alibaba-model-studio-releases',
          'src-kimi-platform-blog'
        ) THEN 0 ELSE 1 END ASC,
        published_at DESC,
        discovered_at DESC
      LIMIT ?
    `).bind(limit).all<{ id: string }>();
    return rows.results.map((row) => row.id);
  }

  async expireStaleDocuments(cutoff: string, expiredAt: string): Promise<number> {
    const result = await this.database.prepare(`
      UPDATE source_documents
      SET status = 'irrelevant', analyzed_at = ?, analysis_error_code = NULL, updated_at = ?
      WHERE status IN ('pending_analysis', 'analysis_failed')
        AND datetime(published_at) < datetime(?)
    `).bind(expiredAt, expiredAt, cutoff).run();
    return Number(result.meta.changes ?? 0);
  }

  async insertDocument(input: {
    id: string;
    sourceId: string;
    item: NormalizedFeedItem;
    discoveredAt: string;
  }): Promise<boolean> {
    const result = await this.database.prepare(`
      INSERT OR IGNORE INTO source_documents (
        id, source_id, external_id, canonical_url, title, author, published_at, discovered_at,
        content_excerpt, content_hash, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_analysis', ?, ?)
    `).bind(
      input.id,
      input.sourceId,
      input.item.externalId,
      input.item.canonicalUrl,
      input.item.title,
      input.item.author,
      input.item.publishedAt,
      input.discoveredAt,
      input.item.contentExcerpt,
      input.item.contentHash,
      input.discoveredAt,
      input.discoveredAt,
    ).run();
    return Number(result.meta.changes ?? 0) > 0;
  }

  async claimDocument(documentId: string, startedAt: string, staleBefore: string): Promise<DocumentView | null> {
    const result = await this.database.prepare(`
      UPDATE source_documents
      SET status = 'analyzing', analysis_started_at = ?, analysis_error_code = NULL, updated_at = ?
      WHERE id = ? AND (
        status IN ('pending_analysis', 'analysis_failed')
        OR (status = 'analyzing' AND analysis_started_at < ?)
      )
    `).bind(startedAt, startedAt, documentId, staleBefore).run();
    if (Number(result.meta.changes ?? 0) === 0) return null;
    return this.getDocument(documentId);
  }

  async completeIrrelevant(documentId: string, analyzedAt: string): Promise<void> {
    await this.database.prepare(`
      UPDATE source_documents
      SET status = 'irrelevant', analyzed_at = ?, analysis_error_code = NULL, updated_at = ?
      WHERE id = ? AND status = 'analyzing'
    `).bind(analyzedAt, analyzedAt, documentId).run();
  }

  async completeCandidate(input: {
    documentId: string;
    candidateId: string;
    output: PipelinePreviewOutput;
    analysisMeta: AnalysisExecutionMeta;
    analyzedAt: string;
  }): Promise<void> {
    if (
      input.output.taskStatus !== "ok"
      || !input.output.eventType
      || !input.output.titleZh
      || !input.output.whatChanged
      || !input.output.evidenceLevel
    ) {
      throw new Error("Cannot persist an incomplete candidate");
    }
    await this.database.batch([
      this.database.prepare(`
        INSERT INTO event_candidates (
          id, document_id, review_status, event_type, title_zh, what_changed, evidence_level,
          confidence, needs_review, review_reasons_json, source_ids_json, prompt_version, model_id,
          provider, escalated, attempts, latency_ms, input_tokens, output_tokens, total_tokens,
          reasoning_tokens, created_at, updated_at
        ) VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(document_id) DO NOTHING
      `).bind(
        input.candidateId,
        input.documentId,
        input.output.eventType,
        input.output.titleZh,
        input.output.whatChanged,
        input.output.evidenceLevel,
        input.output.confidence,
        input.output.needsReview ? 1 : 0,
        JSON.stringify(input.output.reviewReasons),
        JSON.stringify(input.output.sourceIds),
        input.output.promptVersion,
        input.output.modelId,
        input.analysisMeta.provider,
        input.analysisMeta.escalated ? 1 : 0,
        input.analysisMeta.attempts,
        input.analysisMeta.latencyMs,
        input.analysisMeta.usage.inputTokens,
        input.analysisMeta.usage.outputTokens,
        input.analysisMeta.usage.totalTokens,
        input.analysisMeta.usage.reasoningTokens,
        input.analyzedAt,
        input.analyzedAt,
      ),
      this.database.prepare(`
        UPDATE source_documents
        SET status = 'candidate_created', candidate_id = ?, analyzed_at = ?, analysis_error_code = NULL, updated_at = ?
        WHERE id = ? AND status = 'analyzing'
      `).bind(input.candidateId, input.analyzedAt, input.analyzedAt, input.documentId),
    ]);
  }

  async failAnalysis(documentId: string, failedAt: string, errorCode: string): Promise<void> {
    await this.database.prepare(`
      UPDATE source_documents
      SET status = 'analysis_failed', analyzed_at = ?, analysis_error_code = ?, updated_at = ?
      WHERE id = ? AND status = 'analyzing'
    `).bind(failedAt, errorCode, failedAt, documentId).run();
  }

  async reviewCandidate(input: {
    candidateId: string;
    action: ReviewAction;
    note: string | null;
    actor: ReviewActor;
    reviewedAt: string;
    actionId: string;
  }): Promise<CandidateView | null> {
    const targetStatus = input.action === "approve" ? "approved" : input.action === "reject" ? "rejected" : "pending";
    const allowedStatus = input.action === "reopen" ? ["approved", "rejected"] : ["pending"];
    const placeholders = allowedStatus.map(() => "?").join(", ");
    const reviewedAt = targetStatus === "pending" ? null : input.reviewedAt;
    const reviewedBy = targetStatus === "pending" ? null : input.actor.email;
    const reviewNote = targetStatus === "pending" ? null : input.note;

    const [updateResult] = await this.database.batch([
      this.database.prepare(`
        UPDATE event_candidates
        SET review_status = ?, reviewed_at = ?, reviewed_by = ?, review_note = ?, updated_at = ?
        WHERE id = ? AND review_status IN (${placeholders})
      `).bind(
        targetStatus,
        reviewedAt,
        reviewedBy,
        reviewNote,
        input.reviewedAt,
        input.candidateId,
        ...allowedStatus,
      ),
      this.database.prepare(`
        INSERT INTO review_actions (id, candidate_id, action, actor_id, actor_email, note, created_at)
        SELECT ?, id, ?, ?, ?, ?, ?
        FROM event_candidates
        WHERE id = ? AND review_status = ? AND updated_at = ?
      `).bind(
        input.actionId,
        input.action === "approve" ? "approved" : input.action === "reject" ? "rejected" : "reopened",
        input.actor.id,
        input.actor.email,
        input.note,
        input.reviewedAt,
        input.candidateId,
        targetStatus,
        input.reviewedAt,
      ),
    ]);
    if (Number(updateResult.meta.changes ?? 0) === 0) return null;
    return this.getCandidate(input.candidateId);
  }

  async getDashboard(): Promise<DashboardData> {
    const [sourceRows, documentRows, candidateRows, runRows, countRows] = await Promise.all([
      this.database.prepare(`
        SELECT id, name, homepage_url, feed_url, source_type, status, authorization_status,
          frequency_minutes, last_attempt_at, last_success_at, consecutive_failures, last_error_code
        FROM sources ORDER BY priority ASC, name ASC
      `).all<Record<string, unknown>>(),
      this.database.prepare(`
        SELECT d.id, d.source_id, s.name AS source_name, d.canonical_url, d.title, d.author,
          d.published_at, d.discovered_at, d.content_excerpt, d.status, d.analysis_error_code
        FROM source_documents d
        JOIN sources s ON s.id = d.source_id
        WHERE d.status IN ('pending_analysis', 'analysis_failed', 'analyzing')
        ORDER BY d.discovered_at DESC LIMIT 50
      `).all<Record<string, unknown>>(),
      this.database.prepare(candidateSelectSql("ORDER BY c.created_at DESC LIMIT 100"))
        .all<Record<string, unknown>>(),
      this.database.prepare(`
        SELECT r.id, r.source_id, s.name AS source_name, r.status, r.trigger_kind, r.started_at, r.completed_at,
          r.discovered_count, r.inserted_count, r.duplicate_count, r.error_code
        FROM ingestion_runs r
        JOIN sources s ON s.id = r.source_id
        ORDER BY r.started_at DESC LIMIT 20
      `).all<Record<string, unknown>>(),
      this.database.prepare(`
        SELECT
          (SELECT COUNT(*) FROM source_documents WHERE status IN ('pending_analysis', 'analysis_failed', 'analyzing')) AS pending_analysis,
          (SELECT COUNT(*) FROM event_candidates WHERE review_status = 'pending') AS pending_review,
          (SELECT COUNT(*) FROM event_candidates WHERE review_status = 'approved') AS approved,
          (SELECT COUNT(*) FROM event_candidates WHERE review_status = 'rejected') AS rejected
      `).first<Record<string, unknown>>(),
    ]);

    return dashboardDataSchema.parse({
      sources: sourceRows.results.map(mapSource),
      pendingDocuments: documentRows.results.map(mapDocument),
      candidates: candidateRows.results.map(mapCandidate),
      recentRuns: runRows.results.map(mapRun),
      counts: {
        pendingAnalysis: Number(countRows?.pending_analysis ?? 0),
        pendingReview: Number(countRows?.pending_review ?? 0),
        approved: Number(countRows?.approved ?? 0),
        rejected: Number(countRows?.rejected ?? 0),
      },
    });
  }

  private async getDocument(documentId: string): Promise<DocumentView | null> {
    const row = await this.database.prepare(`
      SELECT d.id, d.source_id, s.name AS source_name, d.canonical_url, d.title, d.author,
        d.published_at, d.discovered_at, d.content_excerpt, d.status, d.analysis_error_code
      FROM source_documents d JOIN sources s ON s.id = d.source_id WHERE d.id = ?
    `).bind(documentId).first<Record<string, unknown>>();
    return row ? mapDocument(row) : null;
  }

  private async getCandidate(candidateId: string): Promise<CandidateView | null> {
    const row = await this.database.prepare(candidateSelectSql("WHERE c.id = ?"))
      .bind(candidateId).first<Record<string, unknown>>();
    return row ? mapCandidate(row) : null;
  }
}

function candidateSelectSql(suffix: string): string {
  return `
    SELECT c.id, c.document_id, s.name AS source_name, d.canonical_url, d.title AS source_title,
      d.published_at, c.review_status, c.event_type, c.title_zh, c.what_changed, c.evidence_level,
      c.confidence, c.needs_review, c.review_reasons_json, c.source_ids_json, c.prompt_version,
      c.model_id, c.provider, c.escalated, c.attempts, c.latency_ms, c.input_tokens,
      c.output_tokens, c.total_tokens, c.reasoning_tokens, c.reviewed_at, c.reviewed_by,
      c.review_note, c.created_at
    FROM event_candidates c
    JOIN source_documents d ON d.id = c.document_id
    JOIN sources s ON s.id = d.source_id
    ${suffix}
  `;
}

function mapSource(row: Record<string, unknown>) {
  return sourceViewSchema.parse({
    id: row.id,
    name: row.name,
    homepageUrl: row.homepage_url,
    feedUrl: row.feed_url,
    sourceType: row.source_type,
    status: row.status,
    authorizationStatus: row.authorization_status,
    frequencyMinutes: Number(row.frequency_minutes),
    lastAttemptAt: row.last_attempt_at ?? null,
    lastSuccessAt: row.last_success_at ?? null,
    consecutiveFailures: Number(row.consecutive_failures),
    lastErrorCode: row.last_error_code ?? null,
  });
}

function mapDocument(row: Record<string, unknown>) {
  return documentViewSchema.parse({
    id: row.id,
    sourceId: row.source_id,
    sourceName: row.source_name,
    canonicalUrl: row.canonical_url,
    title: row.title,
    author: row.author ?? null,
    publishedAt: row.published_at,
    discoveredAt: row.discovered_at,
    contentExcerpt: row.content_excerpt,
    status: row.status,
    analysisErrorCode: row.analysis_error_code ?? null,
  });
}

function mapCandidate(row: Record<string, unknown>) {
  return candidateViewSchema.parse({
    id: row.id,
    documentId: row.document_id,
    sourceName: row.source_name,
    canonicalUrl: row.canonical_url,
    sourceTitle: row.source_title,
    publishedAt: row.published_at,
    reviewStatus: row.review_status,
    eventType: row.event_type,
    titleZh: row.title_zh,
    whatChanged: row.what_changed,
    evidenceLevel: row.evidence_level,
    confidence: Number(row.confidence),
    needsReview: Boolean(row.needs_review),
    reviewReasons: parseStringArray(row.review_reasons_json),
    sourceIds: parseStringArray(row.source_ids_json),
    promptVersion: row.prompt_version,
    modelId: row.model_id,
    provider: row.provider,
    escalated: Boolean(row.escalated),
    attempts: Number(row.attempts),
    latencyMs: Number(row.latency_ms),
    usage: {
      inputTokens: Number(row.input_tokens),
      outputTokens: Number(row.output_tokens),
      totalTokens: Number(row.total_tokens),
      reasoningTokens: Number(row.reasoning_tokens),
    },
    reviewedAt: row.reviewed_at ?? null,
    reviewedBy: row.reviewed_by ?? null,
    reviewNote: row.review_note ?? null,
    createdAt: row.created_at,
  });
}

function mapRun(row: Record<string, unknown>) {
  return ingestionRunViewSchema.parse({
    id: row.id,
    sourceId: row.source_id,
    sourceName: row.source_name,
    status: row.status,
    triggerKind: row.trigger_kind,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? null,
    discoveredCount: Number(row.discovered_count),
    insertedCount: Number(row.inserted_count),
    duplicateCount: Number(row.duplicate_count),
    errorCode: row.error_code ?? null,
  });
}

function parseStringArray(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
