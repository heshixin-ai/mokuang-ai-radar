import type { EmailConfig } from "@/lib/subscriptions/types";

export type EmailMessage = { to: string; subject: string; html: string; idempotencyKey: string };
export type EmailResult = { status: "queued" | "sent"; providerId: string | null };

export async function deliverEmail(message: EmailMessage, config: EmailConfig, fetcher: typeof fetch = fetch): Promise<EmailResult> {
  if (config.EMAIL_PROVIDER === "outbox") return { status: "queued", providerId: null };
  const response = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.RESEND_API_KEY}`,
      "content-type": "application/json",
      "idempotency-key": message.idempotencyKey,
      "user-agent": "mokuang-digest/1.0",
    },
    body: JSON.stringify({ from: config.EMAIL_FROM, to: [message.to], subject: message.subject, html: message.html }),
  });
  if (!response.ok) throw new Error(`EMAIL_PROVIDER_${response.status}`);
  const payload = await response.json() as { id?: string };
  return { status: "sent", providerId: payload.id ?? null };
}
