import { getD1 } from "@/db";
import { evaluateLaunchContract } from "@/lib/quality/evaluation";

export type OperationsDashboard = {
  generatedAt: string;
  observation: { requiredDays: 7; observedFrom: string | null; observedDays: number; complete: boolean };
  quality: ReturnType<typeof evaluateLaunchContract>;
  sources: Array<{ id: string; name: string; attempts: number; successes: number; successRate: number | null; consecutiveFailures: number; lastSuccessAt: string | null; alert: boolean }>;
  email: { queued: number; sent: number; failed: number; activeSubscribers: number };
  alerts: string[];
};

export async function getOperationsDashboard(database: D1Database = getD1(), now = new Date()): Promise<OperationsDashboard> {
  const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const [sourceRows, observationRow, emailRow] = await Promise.all([
    database.prepare(`
      SELECT s.id, s.name, s.consecutive_failures, s.last_success_at,
        COUNT(r.id) AS attempts, SUM(CASE WHEN r.status = 'succeeded' THEN 1 ELSE 0 END) AS successes
      FROM sources s LEFT JOIN ingestion_runs r ON r.source_id = s.id AND r.started_at >= ?
      WHERE s.status = 'active' GROUP BY s.id, s.name, s.consecutive_failures, s.last_success_at ORDER BY s.priority ASC
    `).bind(since).all<Record<string, unknown>>(),
    database.prepare("SELECT MIN(started_at) AS observed_from FROM ingestion_runs").first<Record<string, unknown>>(),
    database.prepare(`
      SELECT
        (SELECT COUNT(*) FROM email_outbox WHERE status = 'queued') AS queued,
        (SELECT COUNT(*) FROM email_outbox WHERE status = 'sent') AS sent,
        (SELECT COUNT(*) FROM email_outbox WHERE status = 'failed') AS failed,
        (SELECT COUNT(*) FROM subscribers WHERE status = 'active') AS active_subscribers
    `).first<Record<string, unknown>>(),
  ]);
  const sources = sourceRows.results.map((row) => {
    const attempts = Number(row.attempts ?? 0); const successes = Number(row.successes ?? 0); const consecutiveFailures = Number(row.consecutive_failures ?? 0);
    return { id: String(row.id), name: String(row.name), attempts, successes, successRate: attempts > 0 ? successes / attempts : null, consecutiveFailures, lastSuccessAt: row.last_success_at ? String(row.last_success_at) : null, alert: consecutiveFailures >= 3 };
  });
  const observedFrom = observationRow?.observed_from ? String(observationRow.observed_from) : null;
  const observedDays = observedFrom ? Math.min(7, Math.max(0, (now.getTime() - Date.parse(observedFrom)) / 86_400_000)) : 0;
  const alerts = sources.filter((source) => source.alert).map((source) => `${source.name} 已连续失败 ${source.consecutiveFailures} 次`);
  const emailFailed = Number(emailRow?.failed ?? 0);
  if (emailFailed > 0) alerts.push(`${emailFailed} 封邮件发送失败`);
  return {
    generatedAt: now.toISOString(),
    observation: { requiredDays: 7, observedFrom, observedDays: Number(observedDays.toFixed(1)), complete: observedDays >= 7 },
    quality: evaluateLaunchContract(), sources,
    email: { queued: Number(emailRow?.queued ?? 0), sent: Number(emailRow?.sent ?? 0), failed: emailFailed, activeSubscribers: Number(emailRow?.active_subscribers ?? 0) },
    alerts,
  };
}
