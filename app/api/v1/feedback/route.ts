import { z, ZodError } from "zod";
import { getD1 } from "@/db";
import { errorResponse } from "@/lib/http/error";

const inputSchema = z.object({ kind: z.enum(["correction", "privacy"]), email: z.email().max(320), eventId: z.string().trim().max(200).nullable(), message: z.string().trim().min(20).max(4_000), website: z.string().max(0) }).strict();

export async function POST(request: Request) {
  try {
    const input = inputSchema.parse(await request.json()); const id = `feedback_${crypto.randomUUID()}`; const now = new Date().toISOString();
    await getD1().prepare("INSERT INTO feedback_requests (id, kind, email, event_id, message, status, created_at) VALUES (?, ?, ?, ?, ?, 'open', ?)")
      .bind(id, input.kind, input.email.trim().toLowerCase(), input.eventId || null, input.message, now).run();
    return Response.json({ data: { requestId: id } }, { status: 202 });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) return errorResponse(400, "INVALID_FEEDBACK", "请填写有效邮箱和至少 20 个字的说明。");
    return errorResponse(500, "FEEDBACK_FAILED", "请求暂时无法保存，请稍后重试。");
  }
}
