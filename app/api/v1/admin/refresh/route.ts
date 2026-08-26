import { ZodError } from "zod";
import { getD1 } from "@/db";
import { readAiConfig } from "@/lib/ai/config";
import { getReviewActorFromHeaders } from "@/lib/auth/review-access";
import { errorResponse } from "@/lib/http/error";
import { readExternalRefreshSchedulerConfig } from "@/lib/ingestion/scheduler-config";
import { runScheduledRefresh } from "@/lib/ingestion/scheduler";
import { createD1IngestionRepository } from "@/lib/repository/ingestion";
import { runDailyDigest } from "@/lib/subscriptions/digest";
import { readEmailConfig } from "@/lib/subscriptions/types";

export async function POST(request: Request) {
  const access = getReviewActorFromHeaders(request.headers);
  if (!access.ok) {
    return errorResponse(
      access.reason === "unauthenticated" ? 401 : 403,
      access.reason === "unauthenticated" ? "REVIEW_AUTH_REQUIRED" : "REVIEW_ACCESS_DENIED",
      access.reason === "unauthenticated" ? "缺少有效的自动化访问凭据。" : "当前账号没有运行刷新任务的权限。",
    );
  }

  try {
    const startedAt = Date.now();
    const database = getD1();
    const refresh = await runScheduledRefresh({
      repository: createD1IngestionRepository(database),
      aiConfig: readAiConfig(),
      schedulerConfig: readExternalRefreshSchedulerConfig(),
      actor: access.actor,
    });
    const digest = await runDailyDigest({
      database,
      config: readEmailConfig(),
    });

    console.log("mokuang_external_refresh", JSON.stringify({
      sourcesEligible: refresh.sourcesEligible,
      sourcesSucceeded: refresh.sourcesSucceeded,
      sourcesFailed: refresh.sourcesFailed,
      insertedCount: refresh.insertedCount,
      expiredCount: refresh.expiredCount,
      analysesAttempted: refresh.analysesAttempted,
      candidatesCreated: refresh.candidatesCreated,
      analysesFailed: refresh.analysesFailed,
      digestClaimed: digest.claimed,
      digestSent: digest.sent,
      digestFailed: digest.failed,
      durationMs: Date.now() - startedAt,
    }));

    return Response.json(
      {
        data: { refresh, digest },
        meta: {
          mode: "bounded_external_refresh",
          durationMs: Date.now() - startedAt,
          published: false,
        },
      },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse(500, "REFRESH_CONFIG_INVALID", "自动刷新配置不正确，任务没有执行。");
    }
    return errorResponse(500, "EXTERNAL_REFRESH_FAILED", "自动刷新失败，运行状态已保留供排查。");
  }
}
