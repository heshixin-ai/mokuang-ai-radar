import type { IntelligenceEvent } from "@/lib/domain/event";
import { D1EventWorkflowRepository } from "@/lib/repository/event-workflow";
import { D1SubscriptionRepository } from "@/lib/repository/subscriptions";
import { deliverEmail } from "@/lib/subscriptions/email";
import { emailLayout, escapeHtml } from "@/lib/subscriptions/service";
import type { EmailConfig } from "@/lib/subscriptions/types";

export async function runDailyDigest(options: {
  database: D1Database;
  config: EmailConfig;
  clock?: () => Date;
}): Promise<{ claimed: boolean; subscribers: number; sent: number; skipped: number; failed: number }> {
  const clock = options.clock ?? (() => new Date());
  const now = clock();
  const date = shanghaiDate(now);
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", hour: "2-digit", hourCycle: "h23" }).format(now));
  if (hour < 8) return { claimed: false, subscribers: 0, sent: 0, skipped: 0, failed: 0 };
  const repository = new D1SubscriptionRepository(options.database);
  const runId = await repository.claimDigest(date, now.toISOString());
  if (!runId) return { claimed: false, subscribers: 0, sent: 0, skipped: 0, failed: 0 };
  const subscribers = await repository.listActiveSubscribers();
  const events = (await new D1EventWorkflowRepository(options.database).listPublished())
    .filter((event) => shanghaiDate(new Date(event.publishedAt)) === date);
  let sent = 0; let skipped = 0; let failed = 0;
  for (const subscriber of subscribers) {
    const selected = events.filter((event) => subscriber.topics.includes(event.eventType));
    if (selected.length === 0) { skipped += 1; continue; }
    const unsubscribeUrl = `${options.config.PUBLIC_SITE_URL.replace(/\/$/, "")}/api/v1/subscriptions/unsubscribe?token=${encodeURIComponent(subscriber.unsubscribeToken)}`;
    const subject = `模况日报｜${selected.length} 条值得处理的 AI 变化`;
    const html = renderDigest(date, selected, unsubscribeUrl, options.config.PUBLIC_SITE_URL);
    const queued = await repository.queueEmail({
      subscriberId: subscriber.id, kind: "digest", to: subscriber.email, subject, html,
      dedupeKey: `digest:${date}:${subscriber.id}`, now: now.toISOString(),
    });
    if (!queued.created) { skipped += 1; continue; }
    try {
      const result = await deliverEmail({ to: subscriber.email, subject, html, idempotencyKey: `mokuang-${date}-${subscriber.id}` }, options.config);
      await repository.markEmail(queued.id, result, now.toISOString()); sent += 1;
    } catch (error) {
      await repository.markEmailFailed(queued.id, error instanceof Error ? error.message : "EMAIL_SEND_FAILED"); failed += 1;
    }
  }
  await repository.finishDigest(runId, { subscribers: subscribers.length, sent, skipped, failed }, clock().toISOString());
  return { claimed: true, subscribers: subscribers.length, sent, skipped, failed };
}

function renderDigest(date: string, events: IntelligenceEvent[], unsubscribeUrl: string, siteUrl: string): string {
  const items = events.map((event) => `<article style="padding:20px 0;border-top:1px solid #d8d4ca"><h2 style="font-size:20px"><a href="${escapeHtml(`${siteUrl.replace(/\/$/, "")}/events/${event.id}`)}">${escapeHtml(event.titleZh)}</a></h2><p>${escapeHtml(event.deckZh)}</p><p><strong>建议行动：</strong>${escapeHtml(event.recommendedAction ?? "继续观察。")}</p></article>`).join("");
  return emailLayout(`${date} AI 变化日报`, `${items}<p style="margin-top:32px"><a href="${escapeHtml(unsubscribeUrl)}">退订日报</a></p>`);
}

function shanghaiDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
