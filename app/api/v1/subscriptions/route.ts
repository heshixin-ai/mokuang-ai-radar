import { ZodError } from "zod";
import { errorResponse } from "@/lib/http/error";
import { subscribe } from "@/lib/subscriptions/service";
import { readEmailConfig, subscribeInputSchema } from "@/lib/subscriptions/types";

export async function POST(request: Request) {
  try {
    const parsed = subscribeInputSchema.parse(await request.json());
    const config = readEmailConfig();
    const data = await subscribe(parsed, {
      config: config.EMAIL_PROVIDER === "outbox" ? { ...config, PUBLIC_SITE_URL: new URL(request.url).origin } : config,
    });
    return Response.json({ data }, { status: 202, headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) return errorResponse(400, "INVALID_SUBSCRIPTION", "请填写有效邮箱、至少一个主题并同意接收日报。");
    return errorResponse(503, "SUBSCRIPTION_DELIVERY_FAILED", "确认邮件暂时无法发送，请稍后重试。");
  }
}
