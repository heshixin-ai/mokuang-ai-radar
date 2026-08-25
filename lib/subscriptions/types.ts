import { z } from "zod";

export const topicSlugs = ["model_release", "api_change", "pricing", "policy", "funding", "research"] as const;
export const topicLabels: Record<(typeof topicSlugs)[number], string> = {
  model_release: "模型发布", api_change: "API 变化", pricing: "价格变化",
  policy: "政策", funding: "融资", research: "研究",
};

export const subscribeInputSchema = z.object({
  email: z.email().max(320).transform((value) => value.trim().toLowerCase()),
  topics: z.array(z.enum(topicSlugs)).min(1).max(topicSlugs.length),
  consent: z.literal(true),
}).strict();

export type SubscribeInput = z.infer<typeof subscribeInputSchema>;
export type SubscriberDelivery = { id: string; email: string; unsubscribeToken: string; topics: string[] };

export const emailConfigSchema = z.object({
  EMAIL_PROVIDER: z.enum(["outbox", "resend"]).default("outbox"),
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(3).default("模况 <digest@mokuang.local>"),
  PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
});
export type EmailConfig = z.infer<typeof emailConfigSchema>;
export function readEmailConfig(environment: Record<string, string | undefined> = process.env): EmailConfig {
  const config = emailConfigSchema.parse(environment);
  if (config.EMAIL_PROVIDER === "resend" && !config.RESEND_API_KEY) throw new Error("RESEND_API_KEY_REQUIRED");
  return config;
}
