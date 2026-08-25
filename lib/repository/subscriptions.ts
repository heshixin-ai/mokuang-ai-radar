import type { SubscriberDelivery, SubscribeInput } from "@/lib/subscriptions/types";

export class D1SubscriptionRepository {
  constructor(private readonly database: D1Database) {}

  async upsertSubscriber(input: SubscribeInput & { verifyHash: string; unsubscribeToken: string; unsubscribeHash: string; now: string }): Promise<{ id: string; email: string }> {
    const existing = await this.database.prepare("SELECT id FROM subscribers WHERE normalized_email = ?")
      .bind(input.email).first<Record<string, unknown>>();
    const id = existing ? String(existing.id) : `sub_${crypto.randomUUID()}`;
    await this.database.batch([
      this.database.prepare(`
        INSERT INTO subscribers (id, email, normalized_email, status, verify_token_hash, unsubscribe_token, unsubscribe_token_hash,
          consent_at, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)
        ON CONFLICT(normalized_email) DO UPDATE SET email = excluded.email, status = 'pending',
          verify_token_hash = excluded.verify_token_hash, unsubscribe_token = excluded.unsubscribe_token,
          unsubscribe_token_hash = excluded.unsubscribe_token_hash,
          consent_at = excluded.consent_at, verified_at = NULL, unsubscribed_at = NULL, updated_at = excluded.updated_at
      `).bind(id, input.email, input.email, input.verifyHash, input.unsubscribeToken, input.unsubscribeHash, input.now, input.now, input.now),
      this.database.prepare("DELETE FROM subscription_preferences WHERE subscriber_id = ?").bind(id),
      ...input.topics.map((topic) => this.database.prepare(`
        INSERT INTO subscription_preferences (id, subscriber_id, topic_slug, created_at) VALUES (?, ?, ?, ?)
      `).bind(`pref_${crypto.randomUUID()}`, id, topic, input.now)),
    ]);
    return { id, email: input.email };
  }

  async confirm(verifyHash: string, now: string): Promise<boolean> {
    const result = await this.database.prepare(`
      UPDATE subscribers SET status = 'active', verified_at = ?, updated_at = ?
      WHERE verify_token_hash = ? AND status = 'pending'
    `).bind(now, now, verifyHash).run();
    return Number(result.meta.changes ?? 0) > 0;
  }

  async unsubscribe(unsubscribeHash: string, now: string): Promise<boolean> {
    const result = await this.database.prepare(`
      UPDATE subscribers SET status = 'unsubscribed', unsubscribed_at = ?, updated_at = ?
      WHERE unsubscribe_token_hash = ? AND status IN ('pending', 'active')
    `).bind(now, now, unsubscribeHash).run();
    return Number(result.meta.changes ?? 0) > 0;
  }

  async queueEmail(input: { subscriberId: string; kind: "verification" | "digest"; to: string; subject: string; html: string; dedupeKey: string; now: string }): Promise<{ id: string; created: boolean }> {
    const id = `mail_${crypto.randomUUID()}`;
    const result = await this.database.prepare(`
      INSERT INTO email_outbox (id, subscriber_id, kind, to_email, subject, html, dedupe_key, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', ?) ON CONFLICT(dedupe_key) DO NOTHING
    `).bind(id, input.subscriberId, input.kind, input.to, input.subject, input.html, input.dedupeKey, input.now).run();
    return { id, created: Number(result.meta.changes ?? 0) > 0 };
  }

  async markEmail(id: string, result: { status: "queued" | "sent"; providerId: string | null }, now: string): Promise<void> {
    await this.database.prepare(`
      UPDATE email_outbox SET status = ?, provider_id = ?, attempts = attempts + 1,
        sent_at = CASE WHEN ? = 'sent' THEN ? ELSE sent_at END WHERE id = ?
    `).bind(result.status, result.providerId, result.status, now, id).run();
  }

  async markEmailFailed(id: string, code: string): Promise<void> {
    await this.database.prepare("UPDATE email_outbox SET status = 'failed', attempts = attempts + 1, last_error_code = ? WHERE id = ?")
      .bind(code.slice(0, 100), id).run();
  }

  async listActiveSubscribers(): Promise<SubscriberDelivery[]> {
    const rows = await this.database.prepare(`
      SELECT s.id, s.email, s.unsubscribe_token,
        COALESCE(json_group_array(p.topic_slug), '[]') AS topics_json
      FROM subscribers s LEFT JOIN subscription_preferences p ON p.subscriber_id = s.id
      WHERE s.status = 'active' GROUP BY s.id, s.email, s.unsubscribe_token_hash ORDER BY s.created_at ASC
    `).all<Record<string, unknown>>();
    return rows.results.map((row) => ({
      id: String(row.id), email: String(row.email), unsubscribeToken: String(row.unsubscribe_token),
      topics: JSON.parse(String(row.topics_json)) as string[],
    }));
  }

  async claimDigest(date: string, now: string): Promise<string | null> {
    const id = `digest_${date}`;
    const result = await this.database.prepare(`
      INSERT INTO digest_runs (id, digest_date, status, started_at, created_at) VALUES (?, ?, 'running', ?, ?)
      ON CONFLICT(digest_date) DO NOTHING
    `).bind(id, date, now, now).run();
    return Number(result.meta.changes ?? 0) > 0 ? id : null;
  }

  async finishDigest(id: string, counts: { subscribers: number; sent: number; skipped: number; failed: number }, now: string): Promise<void> {
    await this.database.prepare(`
      UPDATE digest_runs SET status = ?, subscriber_count = ?, sent_count = ?, skipped_count = ?, failed_count = ?, completed_at = ? WHERE id = ?
    `).bind(counts.failed > 0 ? "failed" : "succeeded", counts.subscribers, counts.sent, counts.skipped, counts.failed, now, id).run();
  }
}
