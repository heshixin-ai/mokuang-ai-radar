import { getD1 } from "@/db";
import { createOpaqueToken, hashToken } from "@/lib/subscriptions/crypto";
import { deliverEmail } from "@/lib/subscriptions/email";
import { readEmailConfig, subscribeInputSchema, type EmailConfig, type SubscribeInput } from "@/lib/subscriptions/types";
import { D1SubscriptionRepository } from "@/lib/repository/subscriptions";

export async function subscribe(
  rawInput: SubscribeInput,
  options: { repository?: D1SubscriptionRepository; config?: EmailConfig; now?: () => Date } = {},
): Promise<{ status: "verification_sent"; previewUrl?: string }> {
  const input = subscribeInputSchema.parse(rawInput);
  const repository = options.repository ?? new D1SubscriptionRepository(getD1());
  const config = options.config ?? readEmailConfig();
  const verifyToken = createOpaqueToken();
  const unsubscribeToken = createOpaqueToken();
  const now = (options.now ?? (() => new Date()))().toISOString();
  const subscriber = await repository.upsertSubscriber({
    ...input,
    verifyHash: await hashToken(verifyToken),
    unsubscribeToken,
    unsubscribeHash: await hashToken(unsubscribeToken),
    now,
  });
  const verificationUrl = `${config.PUBLIC_SITE_URL.replace(/\/$/, "")}/api/v1/subscriptions/verify?token=${encodeURIComponent(verifyToken)}`;
  const subject = "确认订阅模况 AI 变化日报";
  const html = emailLayout("确认你的订阅", `<p>点击下面的按钮确认邮箱。确认前不会发送日报。</p><p><a href="${escapeHtml(verificationUrl)}">确认订阅</a></p>`);
  const queued = await repository.queueEmail({
    subscriberId: subscriber.id, kind: "verification", to: subscriber.email, subject, html,
    dedupeKey: `verify:${subscriber.id}:${await hashToken(verifyToken)}`, now,
  });
  if (queued.created) {
    try {
      const result = await deliverEmail({ to: subscriber.email, subject, html, idempotencyKey: `mokuang-${queued.id}` }, config);
      await repository.markEmail(queued.id, result, now);
    } catch (error) {
      await repository.markEmailFailed(queued.id, error instanceof Error ? error.message : "EMAIL_SEND_FAILED");
      throw error;
    }
  }
  return { status: "verification_sent", ...(config.EMAIL_PROVIDER === "outbox" && process.env.NODE_ENV !== "production" ? { previewUrl: verificationUrl } : {}) };
}

export async function verifySubscription(token: string, repository = new D1SubscriptionRepository(getD1())): Promise<boolean> {
  if (token.length < 32) return false;
  return repository.confirm(await hashToken(token), new Date().toISOString());
}

export async function unsubscribe(token: string, repository = new D1SubscriptionRepository(getD1())): Promise<boolean> {
  if (token.length < 32) return false;
  return repository.unsubscribe(await hashToken(token), new Date().toISOString());
}

export function emailLayout(title: string, body: string): string {
  return `<!doctype html><html lang="zh-CN"><body style="margin:0;background:#f4f0e8;color:#17201d;font-family:system-ui,sans-serif"><main style="max-width:640px;margin:auto;padding:40px 24px"><div style="color:#08745c;font-weight:800">模况 MOKUANG</div><h1>${escapeHtml(title)}</h1>${body}<p style="margin-top:40px;color:#65706c;font-size:12px">你收到这封邮件，是因为你主动订阅了模况日报。</p></main></body></html>`;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] ?? character));
}
