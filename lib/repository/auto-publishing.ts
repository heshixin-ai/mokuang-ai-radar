import type { EventType, EvidenceLevel } from "@/lib/domain/event";

export type AutoPublishCandidate = {
  id: string;
  reviewStatus: "pending" | "approved";
  eventType: EventType;
  evidenceLevel: EvidenceLevel;
  confidence: number;
  needsReview: boolean;
  reviewReasons: string[];
  sourceType: "official" | "media" | "research" | "community";
  provider: string;
  escalated: boolean;
};

export interface AutoPublishingRepository {
  listCandidates(limit: number): Promise<AutoPublishCandidate[]>;
  markCandidateForReview(candidateId: string, reason: string): Promise<void>;
  recordCandidateFailure(candidateId: string): Promise<void>;
}

export class D1AutoPublishingRepository implements AutoPublishingRepository {
  constructor(private readonly database: D1Database) {}

  async listCandidates(limit: number): Promise<AutoPublishCandidate[]> {
    const rows = await this.database.prepare(`
      SELECT c.id, c.review_status, c.event_type, c.evidence_level, c.confidence,
        c.needs_review, c.review_reasons_json, c.provider, c.escalated, s.source_type
      FROM event_candidates c
      JOIN source_documents d ON d.id = c.document_id
      JOIN sources s ON s.id = d.source_id
      LEFT JOIN events e ON e.candidate_id = c.id
      LEFT JOIN candidate_clusters cc ON cc.candidate_id = c.id
      WHERE c.review_status IN ('pending', 'approved')
        AND (
          e.id IS NULL
          OR (e.status = 'draft' AND e.quality_status = 'ready')
        )
        AND (
          cc.id IS NULL
          OR (cc.action = 'create_new' AND cc.status IN ('confirmed', 'dismissed'))
        )
      ORDER BY CASE WHEN e.status = 'draft' THEN 0 ELSE 1 END, c.updated_at ASC
      LIMIT ?
    `).bind(limit).all<Record<string, unknown>>();

    return rows.results.map((row) => ({
      id: String(row.id),
      reviewStatus: row.review_status as AutoPublishCandidate["reviewStatus"],
      eventType: row.event_type as EventType,
      evidenceLevel: row.evidence_level as EvidenceLevel,
      confidence: Number(row.confidence),
      needsReview: Boolean(row.needs_review),
      reviewReasons: parseStringArray(row.review_reasons_json),
      sourceType: row.source_type as AutoPublishCandidate["sourceType"],
      provider: String(row.provider),
      escalated: Boolean(row.escalated),
    }));
  }

  async markCandidateForReview(candidateId: string, reason: string): Promise<void> {
    const row = await this.database.prepare(`
      SELECT review_reasons_json FROM event_candidates WHERE id = ?
    `).bind(candidateId).first<{ review_reasons_json: string }>();
    if (!row) return;
    const reasons = [...new Set([...parseStringArray(row.review_reasons_json), reason])];
    await this.database.prepare(`
      UPDATE event_candidates
      SET needs_review = 1, review_reasons_json = ?, updated_at = ?
      WHERE id = ? AND review_status IN ('pending', 'approved')
    `).bind(JSON.stringify(reasons), new Date().toISOString(), candidateId).run();
  }

  async recordCandidateFailure(candidateId: string): Promise<void> {
    await this.database.prepare(`
      UPDATE event_candidates SET updated_at = ?
      WHERE id = ? AND review_status IN ('pending', 'approved')
    `).bind(new Date().toISOString(), candidateId).run();
  }
}

function parseStringArray(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}
