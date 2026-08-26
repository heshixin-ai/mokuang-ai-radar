import { ZodError } from "zod";
import { getD1 } from "@/db";
import { readAiConfig } from "@/lib/ai/config";
import { getReviewActorFromHeaders } from "@/lib/auth/review-access";
import { readAutoPublishConfig } from "@/lib/events/auto-publish-config";
import { createD1AutoPublishingOperations, runSafeAutoPublishingBatch } from "@/lib/events/auto-publishing";
import { errorResponse } from "@/lib/http/error";
import { D1AutoPublishingRepository } from "@/lib/repository/auto-publishing";

export async function POST(request: Request) {
  const access = getReviewActorFromHeaders(request.headers);
  if (!access.ok) {
    return errorResponse(
      access.reason === "unauthenticated" ? 401 : 403,
      access.reason === "unauthenticated" ? "REVIEW_AUTH_REQUIRED" : "REVIEW_ACCESS_DENIED",
      access.reason === "unauthenticated" ? "缺少有效的自动化访问凭据。" : "当前账号没有运行自动发布的权限。",
    );
  }

  try {
    const startedAt = Date.now();
    const database = getD1();
    const aiConfig = readAiConfig();
    const summary = await runSafeAutoPublishingBatch({
      repository: new D1AutoPublishingRepository(database),
      operations: await createD1AutoPublishingOperations(database, aiConfig),
      config: readAutoPublishConfig(),
      actor: access.actor,
    });

    console.log("mokuang_safe_auto_publish", JSON.stringify({
      mode: summary.mode,
      scanned: summary.scanned,
      eligible: summary.eligible,
      attempted: summary.attempted,
      published: summary.published,
      deferred: summary.deferred,
      failed: summary.failed,
      durationMs: Date.now() - startedAt,
    }));

    return Response.json({
      data: { autoPublish: summary },
      meta: { mode: "safe_auto_publish", durationMs: Date.now() - startedAt, published: summary.published > 0 },
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse(500, "AUTO_PUBLISH_CONFIG_INVALID", "自动发布配置不正确，任务没有执行。");
    }
    return errorResponse(500, "AUTO_PUBLISH_FAILED", "自动发布失败，候选和草稿状态已保留供重试。");
  }
}
