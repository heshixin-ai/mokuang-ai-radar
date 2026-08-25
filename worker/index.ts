/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { readAiConfig } from "@/lib/ai/config";
import { readIngestionSchedulerConfig } from "@/lib/ingestion/scheduler-config";
import { runScheduledRefresh } from "@/lib/ingestion/scheduler";
import { createD1IngestionRepository } from "@/lib/repository/ingestion";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
  AI_PROVIDER?: string;
  AI_BASE_URL?: string;
  AI_MODEL_PRIMARY?: string;
  AI_MODEL_ESCALATION?: string;
  AI_API_KEY?: string;
  AI_TIMEOUT_MS?: string;
  AI_MAX_RETRIES?: string;
  AI_ESCALATION_CONFIDENCE?: string;
  AI_MAX_OUTPUT_TOKENS?: string;
  INGESTION_SOURCE_BATCH_SIZE?: string;
  INGESTION_SOURCE_CONCURRENCY?: string;
  INGESTION_MAX_ITEMS_PER_SOURCE?: string;
  INGESTION_ANALYSIS_BATCH_SIZE?: string;
  INGESTION_ANALYSIS_MODE?: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface ScheduledController {
  cron: string;
  scheduledTime: number;
  noRetry(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },

  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    const runtimeEnvironment = readRuntimeEnvironment(env);
    const summary = await runScheduledRefresh({
      repository: createD1IngestionRepository(env.DB),
      aiConfig: readAiConfig(runtimeEnvironment),
      schedulerConfig: readIngestionSchedulerConfig(runtimeEnvironment),
      clock: () => new Date(controller.scheduledTime || Date.now()),
    });
    console.log("mokuang_scheduled_refresh", JSON.stringify({
      cron: controller.cron,
      sourcesEligible: summary.sourcesEligible,
      sourcesSucceeded: summary.sourcesSucceeded,
      sourcesFailed: summary.sourcesFailed,
      insertedCount: summary.insertedCount,
      analysisEnabled: summary.analysisEnabled,
      analysesAttempted: summary.analysesAttempted,
      candidatesCreated: summary.candidatesCreated,
      analysesFailed: summary.analysesFailed,
    }));
  },
};

const runtimeEnvironmentKeys = [
  "AI_PROVIDER",
  "AI_BASE_URL",
  "AI_MODEL_PRIMARY",
  "AI_MODEL_ESCALATION",
  "AI_API_KEY",
  "AI_TIMEOUT_MS",
  "AI_MAX_RETRIES",
  "AI_ESCALATION_CONFIDENCE",
  "AI_MAX_OUTPUT_TOKENS",
  "INGESTION_SOURCE_BATCH_SIZE",
  "INGESTION_SOURCE_CONCURRENCY",
  "INGESTION_MAX_ITEMS_PER_SOURCE",
  "INGESTION_ANALYSIS_BATCH_SIZE",
  "INGESTION_ANALYSIS_MODE",
] as const;

function readRuntimeEnvironment(env: Env): Record<string, string | undefined> {
  const nodeEnvironment = typeof process === "undefined" ? {} : process.env;
  return Object.fromEntries(runtimeEnvironmentKeys.map((key) => [
    key,
    typeof env[key] === "string" ? env[key] : nodeEnvironment[key],
  ]));
}

export default worker;
