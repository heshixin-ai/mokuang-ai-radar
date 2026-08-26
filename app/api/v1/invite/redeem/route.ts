import { z, ZodError } from "zod";
import { getD1 } from "@/db";
import {
  createInviteSession,
  inviteSessionCookie,
  readInviteAccessConfig,
  redeemInviteCode,
  safeInviteReturnPath,
} from "@/lib/auth/invite-access";
import { errorResponse } from "@/lib/http/error";

const inputSchema = z.object({
  code: z.string().trim().min(1).max(64),
  returnTo: z.string().max(500).optional(),
}).strict();

export async function POST(request: Request) {
  try {
    const input = inputSchema.parse(await request.json());
    const config = readInviteAccessConfig(process.env);
    if (!config.enabled || !config.secret) {
      return errorResponse(503, "INVITE_ACCESS_NOT_READY", "邀请码访问正在配置，请稍后再试。");
    }
    const redeemed = await redeemInviteCode(getD1(), input.code);
    if (!redeemed) return errorResponse(401, "INVITE_CODE_INVALID", "邀请码无效、已过期或使用次数已满。");

    const token = await createInviteSession(redeemed, config.secret);
    return Response.json(
      { data: { returnTo: safeInviteReturnPath(input.returnTo) } },
      {
        status: 200,
        headers: {
          "cache-control": "no-store",
          "set-cookie": inviteSessionCookie(token),
        },
      },
    );
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) {
      return errorResponse(400, "INVITE_INPUT_INVALID", "请输入有效的邀请码。");
    }
    return errorResponse(500, "INVITE_REDEEM_FAILED", "邀请码验证暂时失败，请稍后再试。");
  }
}
