import { clusterDashboardSchema, clusterDecisionViewSchema, type ClusterCandidate, type ClusterDashboard, type ClusterDecisionView, type ClusterTarget } from "@/lib/clustering/types";
import type { ClusterSuggestion } from "@/lib/clustering/similarity";
import type { ReviewActor } from "@/lib/repository/ingestion-contract";

export class D1ClusteringRepository {
  constructor(private readonly database: D1Database) {}

  async getCandidate(candidateId: string): Promise<ClusterCandidate | null> {
    const row = await this.database.prepare(`
      SELECT c.id, c.event_type, c.title_zh, c.what_changed
      FROM event_candidates c
      LEFT JOIN event_candidate_links link ON link.candidate_id = c.id
      WHERE c.id = ? AND c.review_status = 'approved' AND link.id IS NULL
    `).bind(candidateId).first<Record<string, unknown>>();
    return row ? {
      id: String(row.id),
      eventType: String(row.event_type),
      titleZh: String(row.title_zh),
      whatChanged: String(row.what_changed),
    } : null;
  }

  async listTargets(candidateId: string, limit = 50): Promise<ClusterTarget[]> {
    const rows = await this.database.prepare(`
      SELECT e.id, e.event_type, e.title_zh, e.what_changed
      FROM events e
      WHERE e.candidate_id != ? AND e.status IN ('draft', 'published')
      ORDER BY e.updated_at DESC LIMIT ?
    `).bind(candidateId, limit).all<Record<string, unknown>>();
    return rows.results.map((row) => ({
      id: String(row.id),
      eventType: String(row.event_type),
      titleZh: String(row.title_zh),
      whatChanged: String(row.what_changed),
    }));
  }

  async getByCandidateId(candidateId: string): Promise<ClusterDecisionView | null> {
    const row = await this.database.prepare(clusterSelectSql("WHERE cc.candidate_id = ?"))
      .bind(candidateId).first<Record<string, unknown>>();
    return row ? mapDecision(row) : null;
  }

  async saveSuggestion(candidate: ClusterCandidate, suggestion: ClusterSuggestion, now: string): Promise<ClusterDecisionView> {
    const status = suggestion.action === "create_new" ? "confirmed" : "proposed";
    const id = `clu_${crypto.randomUUID()}`;
    await this.database.prepare(`
      INSERT INTO candidate_clusters (
        id, candidate_id, action, target_event_id, similarity, reasons_json,
        status, decided_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'rules', ?, ?)
      ON CONFLICT(candidate_id) DO NOTHING
    `).bind(
      id,
      candidate.id,
      suggestion.action,
      suggestion.targetEventId,
      suggestion.similarity,
      JSON.stringify(suggestion.reasons),
      status,
      now,
      now,
    ).run();
    const saved = await this.getByCandidateId(candidate.id);
    if (!saved) throw new Error("Cluster suggestion was not persisted");
    return saved;
  }

  async reviewDecision(input: {
    decisionId: string;
    action: "confirm_merge" | "keep_separate";
    note: string | null;
    actor: ReviewActor;
    now: string;
  }): Promise<ClusterDecisionView | null> {
    const row = await this.database.prepare(`
      SELECT cc.id, cc.candidate_id, cc.target_event_id, cc.status, c.document_id,
        c.what_changed, e.quality_issues_json
      FROM candidate_clusters cc
      JOIN event_candidates c ON c.id = cc.candidate_id
      LEFT JOIN events e ON e.id = cc.target_event_id
      WHERE cc.id = ?
    `).bind(input.decisionId).first<Record<string, unknown>>();
    if (!row || row.status !== "proposed") return null;

    if (input.action === "keep_separate") {
      await this.database.prepare(`
        UPDATE candidate_clusters
        SET action = 'create_new', target_event_id = NULL, status = 'dismissed', decided_by = 'reviewer',
          reviewed_at = ?, reviewed_by = ?, review_note = ?, updated_at = ?
        WHERE id = ? AND status = 'proposed'
      `).bind(input.now, input.actor.email, input.note, input.now, input.decisionId).run();
    } else {
      if (!row.target_event_id) return null;
      const qualityIssues = new Set(parseStringArray(row.quality_issues_json));
      qualityIssues.add("supporting_source_added_review_required");
      await this.database.batch([
        this.database.prepare(`
          INSERT INTO event_sources (id, event_id, document_id, is_primary, created_at)
          VALUES (?, ?, ?, 0, ?) ON CONFLICT(event_id, document_id) DO NOTHING
        `).bind(`es_${crypto.randomUUID()}`, row.target_event_id, row.document_id, input.now),
        this.database.prepare(`
          INSERT INTO event_citations (id, event_id, document_id, claim, supports_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(
          `cit_${crypto.randomUUID()}`,
          row.target_event_id,
          row.document_id,
          row.what_changed,
          JSON.stringify(["whatChanged"]),
          input.now,
        ),
        this.database.prepare(`
          INSERT INTO event_candidate_links (id, event_id, candidate_id, link_kind, created_at)
          VALUES (?, ?, ?, 'supporting', ?)
        `).bind(`ecl_${crypto.randomUUID()}`, row.target_event_id, row.candidate_id, input.now),
        this.database.prepare(`
          UPDATE events SET quality_status = 'blocked', quality_issues_json = ?, updated_at = ? WHERE id = ?
        `).bind(JSON.stringify([...qualityIssues]), input.now, row.target_event_id),
        this.database.prepare(`
          UPDATE candidate_clusters
          SET status = 'confirmed', decided_by = 'reviewer', reviewed_at = ?, reviewed_by = ?,
            review_note = ?, updated_at = ?
          WHERE id = ? AND status = 'proposed'
        `).bind(input.now, input.actor.email, input.note, input.now, input.decisionId),
      ]);
    }
    const updated = await this.database.prepare(clusterSelectSql("WHERE cc.id = ?"))
      .bind(input.decisionId).first<Record<string, unknown>>();
    return updated ? mapDecision(updated) : null;
  }

  async listDashboard(): Promise<ClusterDashboard> {
    const [rows, counts] = await Promise.all([
      this.database.prepare(clusterSelectSql("ORDER BY cc.created_at DESC LIMIT 100")).all<Record<string, unknown>>(),
      this.database.prepare(`
        SELECT
          (SELECT COUNT(*) FROM candidate_clusters WHERE status = 'proposed') AS proposed_count,
          (SELECT COUNT(*) FROM candidate_clusters WHERE status = 'confirmed' AND target_event_id IS NOT NULL) AS merged_count,
          (SELECT COUNT(*) FROM candidate_clusters WHERE action = 'create_new' AND status IN ('confirmed', 'dismissed')) AS separate_count
      `).first<Record<string, unknown>>(),
    ]);
    return clusterDashboardSchema.parse({
      decisions: rows.results.map(mapDecision),
      counts: {
        proposed: Number(counts?.proposed_count ?? 0),
        merged: Number(counts?.merged_count ?? 0),
        separate: Number(counts?.separate_count ?? 0),
      },
    });
  }
}

function clusterSelectSql(suffix: string): string {
  return `
    SELECT cc.id, cc.candidate_id, c.title_zh AS candidate_title, cc.action,
      cc.target_event_id, e.title_zh AS target_event_title, cc.similarity,
      cc.reasons_json, cc.status, cc.decided_by, cc.reviewed_at, cc.reviewed_by,
      cc.review_note, cc.created_at, cc.updated_at
    FROM candidate_clusters cc
    JOIN event_candidates c ON c.id = cc.candidate_id
    LEFT JOIN events e ON e.id = cc.target_event_id
    ${suffix}
  `;
}

function mapDecision(row: Record<string, unknown>): ClusterDecisionView {
  return clusterDecisionViewSchema.parse({
    id: row.id,
    candidateId: row.candidate_id,
    candidateTitle: row.candidate_title,
    action: row.action,
    targetEventId: row.target_event_id ?? null,
    targetEventTitle: row.target_event_title ?? null,
    similarity: Number(row.similarity),
    reasons: parseStringArray(row.reasons_json),
    status: row.status,
    decidedBy: row.decided_by,
    reviewedAt: row.reviewed_at ?? null,
    reviewedBy: row.reviewed_by ?? null,
    reviewNote: row.review_note ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
