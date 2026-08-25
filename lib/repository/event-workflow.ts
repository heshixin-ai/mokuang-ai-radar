import { eventSchema, type EventFilter, type IntelligenceEvent } from "@/lib/domain/event";
import { eventAdminDashboardSchema, eventAdminViewSchema, type ApprovedCandidateMaterial, type EventAdminDashboard, type EventAdminView, type EventEditInput } from "@/lib/events/types";
import type { DraftingResult } from "@/lib/ai/drafting";
import type { ReviewActor } from "@/lib/repository/ingestion-contract";

type QualityResult = {
  status: "blocked" | "ready";
  issues: string[];
  confidence: number;
  needsReview: boolean;
  reviewReasons: string[];
};

export class D1EventWorkflowRepository {
  constructor(private readonly database: D1Database) {}

  async getApprovedCandidateMaterial(candidateId: string): Promise<ApprovedCandidateMaterial | null> {
    const row = await this.database.prepare(`
      SELECT c.id, c.event_type, c.title_zh, c.what_changed, c.evidence_level, c.confidence,
        c.review_note, c.reviewed_at, c.reviewed_by, c.prompt_version, c.model_id,
        d.id AS document_id, d.title AS document_title, d.canonical_url, d.published_at,
        d.content_excerpt, s.name AS publisher, s.source_type
      FROM event_candidates c
      JOIN source_documents d ON d.id = c.document_id
      JOIN sources s ON s.id = d.source_id
      WHERE c.id = ? AND c.review_status = 'approved'
    `).bind(candidateId).first<Record<string, unknown>>();
    if (!row || !row.reviewed_at || !row.reviewed_by) return null;
    return {
      candidate: {
        id: String(row.id),
        eventType: row.event_type as ApprovedCandidateMaterial["candidate"]["eventType"],
        titleZh: String(row.title_zh),
        whatChanged: String(row.what_changed),
        evidenceLevel: row.evidence_level as ApprovedCandidateMaterial["candidate"]["evidenceLevel"],
        confidence: Number(row.confidence),
        reviewNote: row.review_note ? String(row.review_note) : null,
        reviewedAt: String(row.reviewed_at),
        reviewedBy: String(row.reviewed_by),
        promptVersion: String(row.prompt_version),
        modelId: String(row.model_id),
      },
      document: {
        id: String(row.document_id),
        publisher: String(row.publisher),
        sourceType: row.source_type as ApprovedCandidateMaterial["document"]["sourceType"],
        title: String(row.document_title),
        url: String(row.canonical_url),
        publishedAt: new Date(String(row.published_at)).toISOString(),
        body: String(row.content_excerpt),
      },
    };
  }

  async getByCandidateId(candidateId: string): Promise<EventAdminView | null> {
    const row = await this.database.prepare(eventSelectSql("WHERE e.candidate_id = ?"))
      .bind(candidateId).first<Record<string, unknown>>();
    if (!row) return null;
    return this.hydrateOne(row);
  }

  async saveDraft(input: {
    material: ApprovedCandidateMaterial;
    result: DraftingResult;
    quality: QualityResult;
    actor: ReviewActor;
    now: string;
    actionId: string;
  }): Promise<EventAdminView> {
    const eventId = input.result.draft.event_id;
    const sourceLinkId = `es_${crypto.randomUUID()}`;
    const affectedRoles = input.result.impact.affected_roles.map((role) => ({
      role: role.role,
      level: role.impact_level,
      impact: role.impact,
    }));
    const snapshot = {
      eventId,
      candidateId: input.material.candidate.id,
      titleZh: input.result.draft.title_zh,
      qualityStatus: input.quality.status,
      qualityIssues: input.quality.issues,
      promptVersion: input.result.promptVersion,
      modelId: input.result.modelId,
    };
    const statements = [
      this.database.prepare(`
        INSERT INTO events (
          id, candidate_id, status, event_type, title_zh, deck_zh, what_changed,
          before_text, after_text, why_it_matters, recommended_action, affected_roles_json,
          evidence_level, confidence, needs_review, review_reasons_json, announced_at,
          effective_at, quality_status, quality_issues_json, prompt_version, model_id,
          provider, attempts, latency_ms, input_tokens, output_tokens, total_tokens,
          reasoning_tokens, created_at, updated_at
        ) VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        eventId,
        input.material.candidate.id,
        input.material.candidate.eventType,
        input.result.draft.title_zh,
        input.result.draft.deck_zh,
        input.result.draft.what_changed,
        null,
        input.material.candidate.whatChanged,
        input.result.draft.why_it_matters,
        input.result.draft.recommended_action,
        JSON.stringify(affectedRoles),
        input.result.draft.evidence_level,
        input.quality.confidence,
        input.quality.needsReview ? 1 : 0,
        JSON.stringify(input.quality.reviewReasons),
        input.material.document.publishedAt,
        null,
        input.quality.status,
        JSON.stringify(input.quality.issues),
        input.result.promptVersion,
        input.result.modelId,
        input.result.meta.provider,
        input.result.meta.attempts,
        input.result.meta.latencyMs,
        input.result.meta.usage.inputTokens,
        input.result.meta.usage.outputTokens,
        input.result.meta.usage.totalTokens,
        input.result.meta.usage.reasoningTokens,
        input.now,
        input.now,
      ),
      this.database.prepare(`
        INSERT INTO event_sources (id, event_id, document_id, is_primary, created_at)
        VALUES (?, ?, ?, 1, ?)
      `).bind(sourceLinkId, eventId, input.material.document.id, input.now),
      this.database.prepare(`
        INSERT INTO event_candidate_links (id, event_id, candidate_id, link_kind, created_at)
        VALUES (?, ?, ?, 'primary', ?)
      `).bind(`ecl_${crypto.randomUUID()}`, eventId, input.material.candidate.id, input.now),
      ...input.result.draft.claims.flatMap((claim) => claim.source_ids.map((sourceId) =>
        this.database.prepare(`
          INSERT INTO event_citations (id, event_id, document_id, claim, supports_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(
          `cit_${crypto.randomUUID()}`,
          eventId,
          sourceId,
          claim.text,
          JSON.stringify(["whatChanged"]),
          input.now,
        ),
      )),
      this.database.prepare(`
        INSERT INTO publication_actions (
          id, event_id, action, actor_id, actor_email, note, snapshot_json, created_at
        ) VALUES (?, ?, 'draft_created', ?, ?, ?, ?, ?)
      `).bind(
        input.actionId,
        eventId,
        input.actor.id,
        input.actor.email,
        "由已批准候选生成正式事件草稿；尚未发布。",
        JSON.stringify(snapshot),
        input.now,
      ),
      this.database.prepare(`
        INSERT INTO event_revisions (id, event_id, revision_number, actor_id, actor_email, note, snapshot_json, created_at)
        VALUES (?, ?, 1, ?, ?, ?, ?, ?)
      `).bind(
        `rev_${crypto.randomUUID()}`,
        eventId,
        input.actor.id,
        input.actor.email,
        "AI 草稿经审核员触发生成。",
        JSON.stringify(snapshot),
        input.now,
      ),
      this.database.prepare(`
        INSERT INTO event_topics (id, event_id, slug, label, created_at) VALUES (?, ?, ?, ?, ?)
      `).bind(`topic_${crypto.randomUUID()}`, eventId, input.material.candidate.eventType, topicLabel(input.material.candidate.eventType), input.now),
    ];
    await this.database.batch(statements);
    await this.syncTaxonomy(eventId, input.result.draft.title_zh, input.material.candidate.eventType, [input.material.document.publisher], input.now);
    const saved = await this.getByCandidateId(input.material.candidate.id);
    if (!saved) throw new Error("Event draft was not persisted");
    return saved;
  }

  async listAdminDashboard(): Promise<EventAdminDashboard> {
    const [eventRows, countRow] = await Promise.all([
      this.database.prepare(eventSelectSql("ORDER BY e.updated_at DESC LIMIT 100")).all<Record<string, unknown>>(),
      this.database.prepare(`
        SELECT
          (SELECT COUNT(*) FROM events WHERE status = 'draft') AS draft_count,
          (SELECT COUNT(*) FROM events WHERE status = 'draft' AND quality_status = 'ready') AS ready_count,
          (SELECT COUNT(*) FROM events WHERE status = 'published') AS published_count,
          (SELECT COUNT(*) FROM events WHERE status = 'withdrawn') AS withdrawn_count
      `).first<Record<string, unknown>>(),
    ]);
    const events = await this.hydrateMany(eventRows.results);
    return eventAdminDashboardSchema.parse({
      events,
      counts: {
        draft: Number(countRow?.draft_count ?? 0),
        ready: Number(countRow?.ready_count ?? 0),
        published: Number(countRow?.published_count ?? 0),
        withdrawn: Number(countRow?.withdrawn_count ?? 0),
      },
    });
  }

  async transitionPublication(input: {
    eventId: string;
    action: "publish" | "withdraw";
    actor: ReviewActor;
    note: string | null;
    now: string;
    actionId: string;
  }): Promise<EventAdminView | null> {
    const targetStatus = input.action === "publish" ? "published" : "withdrawn";
    const allowedStatus = input.action === "publish" ? ["draft", "withdrawn"] : ["published"];
    const placeholders = allowedStatus.map(() => "?").join(", ");
    const current = await this.database.prepare(eventSelectSql("WHERE e.id = ?"))
      .bind(input.eventId).first<Record<string, unknown>>();
    if (!current) return null;
    const snapshot = JSON.stringify({
      eventId: input.eventId,
      previousStatus: current.status,
      targetStatus,
      titleZh: current.title_zh,
      qualityStatus: current.quality_status,
      qualityIssues: parseStringArray(current.quality_issues_json),
    });
    const qualityClause = input.action === "publish" ? "AND quality_status = 'ready'" : "";
    const result = await this.database.prepare(`
      UPDATE events
      SET status = ?, published_at = CASE WHEN ? = 'published' THEN ? ELSE published_at END,
        published_by = CASE WHEN ? = 'published' THEN ? ELSE published_by END,
        updated_at = ?
      WHERE id = ? AND status IN (${placeholders}) ${qualityClause}
    `).bind(
      targetStatus,
      targetStatus,
      input.now,
      targetStatus,
      input.actor.email,
      input.now,
      input.eventId,
      ...allowedStatus,
    ).run();
    if (Number(result.meta.changes ?? 0) === 0) return null;
    await this.database.prepare(`
      INSERT INTO publication_actions (
        id, event_id, action, actor_id, actor_email, note, snapshot_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      input.actionId,
      input.eventId,
      input.action === "publish" ? "published" : "withdrawn",
      input.actor.id,
      input.actor.email,
      input.note,
      snapshot,
      input.now,
    ).run();
    const updated = await this.database.prepare(eventSelectSql("WHERE e.id = ?"))
      .bind(input.eventId).first<Record<string, unknown>>();
    return updated ? this.hydrateOne(updated) : null;
  }

  async reviseEvent(input: {
    eventId: string;
    edit: EventEditInput;
    actor: ReviewActor;
    now: string;
  }): Promise<EventAdminView | null> {
    const current = await this.getAdminById(input.eventId);
    if (!current || !["draft", "withdrawn"].includes(current.status)) return null;
    const issues = editedQualityIssues(current, input.edit);
    const snapshot = {
      titleZh: input.edit.titleZh,
      deckZh: input.edit.deckZh,
      whatChanged: input.edit.whatChanged,
      before: input.edit.before,
      after: input.edit.after,
      whyItMatters: input.edit.whyItMatters,
      recommendedAction: input.edit.recommendedAction,
      qualityStatus: issues.length === 0 ? "ready" : "blocked",
      qualityIssues: issues,
    };
    const numberRow = await this.database.prepare(`
      SELECT COALESCE(MAX(revision_number), 0) + 1 AS revision_number FROM event_revisions WHERE event_id = ?
    `).bind(input.eventId).first<Record<string, unknown>>();
    const revisionNumber = Number(numberRow?.revision_number ?? 1);
    const result = await this.database.batch([
      this.database.prepare(`
        UPDATE events SET title_zh = ?, deck_zh = ?, what_changed = ?, before_text = ?, after_text = ?,
          why_it_matters = ?, recommended_action = ?, needs_review = 0, review_reasons_json = '[]',
          quality_status = ?, quality_issues_json = ?, updated_at = ?
        WHERE id = ? AND status IN ('draft', 'withdrawn')
      `).bind(
        input.edit.titleZh, input.edit.deckZh, input.edit.whatChanged, input.edit.before,
        input.edit.after, input.edit.whyItMatters, input.edit.recommendedAction,
        snapshot.qualityStatus, JSON.stringify(issues), input.now, input.eventId,
      ),
      this.database.prepare(`
        INSERT INTO event_revisions (id, event_id, revision_number, actor_id, actor_email, note, snapshot_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(`rev_${crypto.randomUUID()}`, input.eventId, revisionNumber, input.actor.id, input.actor.email, input.edit.note, JSON.stringify(snapshot), input.now),
      this.database.prepare(`
        INSERT INTO publication_actions (id, event_id, action, actor_id, actor_email, note, snapshot_json, created_at)
        VALUES (?, ?, 'revised', ?, ?, ?, ?, ?)
      `).bind(`pub_${crypto.randomUUID()}`, input.eventId, input.actor.id, input.actor.email, input.edit.note, JSON.stringify(snapshot), input.now),
    ]);
    if (Number(result[0].meta.changes ?? 0) === 0) return null;
    await this.syncTaxonomy(input.eventId, input.edit.titleZh, current.eventType, current.sources.map((source) => source.publisher), input.now);
    return this.getAdminById(input.eventId);
  }

  async getAdminById(eventId: string): Promise<EventAdminView | null> {
    const row = await this.database.prepare(eventSelectSql("WHERE e.id = ?"))
      .bind(eventId).first<Record<string, unknown>>();
    return row ? this.hydrateOne(row) : null;
  }

  private async syncTaxonomy(eventId: string, title: string, eventType: string, publishers: string[], now: string): Promise<void> {
    await this.database.prepare(`
      INSERT INTO event_topics (id, event_id, slug, label, created_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(event_id, slug) DO NOTHING
    `).bind(`topic_${crypto.randomUUID()}`, eventId, eventType, topicLabel(eventType), now).run();
    const haystack = `${title} ${publishers.join(" ")}`.toLowerCase();
    const matches = knownEntities.filter((entity) => entity.aliases.some((alias) => haystack.includes(alias)));
    for (const entity of matches) {
      await this.database.batch([
        this.database.prepare(`
          INSERT INTO entities (id, slug, name, kind, description, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(slug) DO UPDATE SET updated_at = excluded.updated_at
        `).bind(`entity_${entity.slug}`, entity.slug, entity.name, entity.kind, entity.description, now, now),
        this.database.prepare(`
          INSERT INTO event_entities (id, event_id, entity_id, created_at)
          VALUES (?, ?, ?, ?) ON CONFLICT(event_id, entity_id) DO NOTHING
        `).bind(`ee_${crypto.randomUUID()}`, eventId, `entity_${entity.slug}`, now),
      ]);
    }
  }

  async listPublished(filter: EventFilter = {}): Promise<IntelligenceEvent[]> {
    const conditions = ["e.status = 'published'"];
    const bindings: string[] = [];
    if (filter.type) {
      conditions.push("e.event_type = ?");
      bindings.push(filter.type);
    }
    const rows = await this.database.prepare(eventSelectSql(`
      WHERE ${conditions.join(" AND ")}
      ORDER BY e.published_at DESC
      LIMIT 100
    `)).bind(...bindings).all<Record<string, unknown>>();
    return (await this.hydrateMany(rows.results)).map(toPublicEvent);
  }

  async getPublished(eventId: string): Promise<IntelligenceEvent | null> {
    const row = await this.database.prepare(eventSelectSql("WHERE e.id = ? AND e.status = 'published'"))
      .bind(eventId).first<Record<string, unknown>>();
    if (!row) return null;
    return toPublicEvent(await this.hydrateOne(row));
  }

  private async hydrateOne(row: Record<string, unknown>): Promise<EventAdminView> {
    return (await this.hydrateMany([row]))[0];
  }

  private async hydrateMany(rows: Record<string, unknown>[]): Promise<EventAdminView[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => String(row.id));
    const placeholders = ids.map(() => "?").join(", ");
    const [sourceRows, citationRows, revisionRows] = await Promise.all([
      this.database.prepare(`
        SELECT es.event_id, d.id AS document_id, d.title, d.canonical_url, d.published_at,
          s.name AS publisher, s.source_type
        FROM event_sources es
        JOIN source_documents d ON d.id = es.document_id
        JOIN sources s ON s.id = d.source_id
        WHERE es.event_id IN (${placeholders})
        ORDER BY es.is_primary DESC, d.published_at ASC
      `).bind(...ids).all<Record<string, unknown>>(),
      this.database.prepare(`
        SELECT id, event_id, document_id, claim, supports_json
        FROM event_citations
        WHERE event_id IN (${placeholders})
        ORDER BY created_at ASC
      `).bind(...ids).all<Record<string, unknown>>(),
      this.database.prepare(`
        SELECT id, event_id, revision_number, actor_email, note, created_at
        FROM event_revisions WHERE event_id IN (${placeholders}) ORDER BY revision_number DESC
      `).bind(...ids).all<Record<string, unknown>>(),
    ]);
    const sourcesByEvent = groupBy(sourceRows.results, "event_id");
    const citationsByEvent = groupBy(citationRows.results, "event_id");
    const revisionsByEvent = groupBy(revisionRows.results, "event_id");
    return rows.map((row) => eventAdminViewSchema.parse({
      id: row.id,
      candidateId: row.candidate_id,
      status: row.status,
      eventType: row.event_type,
      titleZh: row.title_zh,
      deckZh: row.deck_zh,
      whatChanged: row.what_changed,
      before: row.before_text ?? null,
      after: row.after_text ?? null,
      whyItMatters: row.why_it_matters,
      recommendedAction: row.recommended_action ?? null,
      affectedRoles: parseJsonArray(row.affected_roles_json),
      evidenceLevel: row.evidence_level,
      confidence: Number(row.confidence),
      needsReview: Boolean(row.needs_review),
      reviewReasons: parseStringArray(row.review_reasons_json),
      announcedAt: row.announced_at ?? null,
      effectiveAt: row.effective_at ?? null,
      qualityStatus: row.quality_status,
      qualityIssues: parseStringArray(row.quality_issues_json),
      promptVersion: row.prompt_version,
      modelId: row.model_id,
      provider: row.provider,
      attempts: Number(row.attempts),
      latencyMs: Number(row.latency_ms),
      usage: {
        inputTokens: Number(row.input_tokens),
        outputTokens: Number(row.output_tokens),
        totalTokens: Number(row.total_tokens),
        reasoningTokens: Number(row.reasoning_tokens),
      },
      publishedAt: row.published_at ?? null,
      publishedBy: row.published_by ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      sources: (sourcesByEvent.get(String(row.id)) ?? []).map((source) => ({
        id: String(source.document_id),
        publisher: String(source.publisher),
        title: String(source.title),
        url: String(source.canonical_url),
        sourceType: source.source_type,
        publishedAt: new Date(String(source.published_at)).toISOString(),
      })),
      citations: (citationsByEvent.get(String(row.id)) ?? []).map((citation) => ({
        id: String(citation.id),
        sourceId: String(citation.document_id),
        claim: String(citation.claim),
        supports: parseStringArray(citation.supports_json),
      })),
      revisions: (revisionsByEvent.get(String(row.id)) ?? []).map((revision) => ({
        id: String(revision.id),
        revisionNumber: Number(revision.revision_number),
        actorEmail: String(revision.actor_email),
        note: String(revision.note),
        createdAt: String(revision.created_at),
      })),
    }));
  }
}

function editedQualityIssues(event: EventAdminView, edit: EventEditInput): string[] {
  const issues: string[] = [];
  if (event.citations.length === 0) issues.push("citations_missing");
  if (event.confidence < 0.8) issues.push("confidence_below_0_8");
  if (event.evidenceLevel === "lead_only") issues.push("lead_only_cannot_publish");
  if (!edit.recommendedAction && ["pricing", "policy"].includes(event.eventType)) issues.push("recommended_action_missing");
  return issues;
}

function topicLabel(eventType: string): string {
  return ({ model_release: "模型发布", api_change: "API 变化", pricing: "价格变化", policy: "政策", funding: "融资", research: "研究" } as Record<string, string>)[eventType] ?? eventType;
}

const knownEntities = [
  { slug: "openai", name: "OpenAI", kind: "company", description: "AI 模型与产品公司。", aliases: ["openai", "gpt"] },
  { slug: "anthropic", name: "Anthropic", kind: "company", description: "Claude 系列模型开发商。", aliases: ["anthropic", "claude"] },
  { slug: "google", name: "Google", kind: "company", description: "Gemini 与 AI 平台提供方。", aliases: ["google", "gemini", "deepmind"] },
  { slug: "deepseek", name: "DeepSeek", kind: "company", description: "基础模型与 API 提供方。", aliases: ["deepseek"] },
  { slug: "vllm", name: "vLLM", kind: "project", description: "开源大模型推理与服务项目。", aliases: ["vllm"] },
  { slug: "meta", name: "Meta", kind: "company", description: "Llama 系列模型开发方。", aliases: ["meta", "llama"] },
] as const;

function eventSelectSql(suffix: string): string {
  return `
    SELECT e.id, e.candidate_id, e.status, e.event_type, e.title_zh, e.deck_zh,
      e.what_changed, e.before_text, e.after_text, e.why_it_matters, e.recommended_action,
      e.affected_roles_json, e.evidence_level, e.confidence, e.needs_review,
      e.review_reasons_json, e.announced_at, e.effective_at, e.quality_status,
      e.quality_issues_json, e.prompt_version, e.model_id, e.provider, e.attempts,
      e.latency_ms, e.input_tokens, e.output_tokens, e.total_tokens, e.reasoning_tokens,
      e.published_at, e.published_by, e.created_at, e.updated_at
    FROM events e
    ${suffix}
  `;
}

function toPublicEvent(event: EventAdminView): IntelligenceEvent {
  if (!event.publishedAt) throw new Error("Published event is missing published_at");
  return eventSchema.parse({
    id: event.id,
    eventType: event.eventType,
    status: "published",
    titleZh: event.titleZh,
    deckZh: event.deckZh,
    whatChanged: event.whatChanged,
    before: event.before,
    after: event.after,
    whyItMatters: event.whyItMatters,
    recommendedAction: event.recommendedAction,
    affectedRoles: event.affectedRoles,
    evidenceLevel: event.evidenceLevel,
    confidence: event.confidence,
    needsReview: false,
    reviewReasons: [],
    announcedAt: event.announcedAt,
    effectiveAt: event.effectiveAt,
    publishedAt: event.publishedAt,
    updatedAt: event.updatedAt,
    sources: event.sources,
    citations: event.citations,
    promptVersion: event.promptVersion,
    modelId: event.modelId,
  });
}

function groupBy(rows: Record<string, unknown>[], key: string): Map<string, Record<string, unknown>[]> {
  const grouped = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const value = String(row[key]);
    grouped.set(value, [...(grouped.get(value) ?? []), row]);
  }
  return grouped;
}

function parseStringArray(value: unknown): string[] {
  return parseJsonArray(value).filter((item): item is string => typeof item === "string");
}

function parseJsonArray(value: unknown): unknown[] {
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
