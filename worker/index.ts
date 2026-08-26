/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { readAiConfig } from "@/lib/ai/config";
import {
  readInviteAccessConfig,
  readInviteCookie,
  verifyInviteSession,
  type InviteSession,
} from "@/lib/auth/invite-access";
import { readIngestionSchedulerConfig } from "@/lib/ingestion/scheduler-config";
import { runScheduledRefresh } from "@/lib/ingestion/scheduler";
import { createD1IngestionRepository } from "@/lib/repository/ingestion";
import { runDailyDigest } from "@/lib/subscriptions/digest";
import { readEmailConfig } from "@/lib/subscriptions/types";

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
  INGESTION_ANALYSIS_CONCURRENCY?: string;
  INGESTION_ANALYSIS_MODE?: string;
  EMAIL_PROVIDER?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  PUBLIC_SITE_URL?: string;
  INVITE_ACCESS_MODE?: string;
  INVITE_SESSION_SECRET?: string;
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

    const access = await authorizeInviteRequest(request, env);
    if (access.response) return secureResponse(access.response, access.enabled);
    request = access.request;

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

    const cacheKey = access.session && isCacheableReaderRequest(request)
      ? new Request(request.url, { method: "GET" })
      : null;
    if (cacheKey) {
      const cached = await caches.default.match(cacheKey);
      if (cached) return secureResponse(cached, access.enabled);
    }

    const response = await handler.fetch(request, env, ctx);
    const secured = secureResponse(response, access.enabled, Boolean(cacheKey));
    if (cacheKey && secured.ok) ctx.waitUntil(caches.default.put(cacheKey, secured.clone()));
    return secured;
  },

  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    const runtimeEnvironment = readRuntimeEnvironment(env);
    const summary = await runScheduledRefresh({
      repository: createD1IngestionRepository(env.DB),
      aiConfig: readAiConfig(runtimeEnvironment),
      schedulerConfig: readIngestionSchedulerConfig(runtimeEnvironment),
      clock: () => new Date(controller.scheduledTime || Date.now()),
    });
    const digest = await runDailyDigest({
      database: env.DB,
      config: readEmailConfig(runtimeEnvironment),
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
      digestClaimed: digest.claimed,
      digestSent: digest.sent,
      digestFailed: digest.failed,
    }));
  },
};

async function authorizeInviteRequest(
  request: Request,
  env: Env,
): Promise<{ request: Request; response: Response | null; session: InviteSession | null; enabled: boolean }> {
  const headers = new Headers(request.headers);
  headers.delete("x-mokuang-invite-id");
  headers.delete("x-mokuang-invite-role");
  const sanitizedRequest = new Request(request, { headers });
  const config = readInviteAccessConfig(env);
  if (!config.enabled) return { request: sanitizedRequest, response: null, session: null, enabled: false };

  const url = new URL(request.url);
  if (isPublicInvitePath(url.pathname) || isPublicAssetPath(url.pathname)) {
    return { request: sanitizedRequest, response: null, session: null, enabled: true };
  }
  if (url.pathname.startsWith("/api/v1/admin/") && headers.get("authorization")?.startsWith("Bearer ")) {
    return { request: sanitizedRequest, response: null, session: null, enabled: true };
  }
  if (!config.secret) {
    return {
      request: sanitizedRequest,
      response: new Response("邀请码访问尚未配置。", { status: 503, headers: { "cache-control": "no-store" } }),
      session: null,
      enabled: true,
    };
  }

  const session = await verifyInviteSession(readInviteCookie(headers.get("cookie")), config.secret);
  if (!session) {
    const response = url.pathname.startsWith("/api/")
      ? Response.json({ error: { code: "INVITE_ACCESS_REQUIRED", message: "请先使用邀请码进入模况。" } }, { status: 401, headers: { "cache-control": "no-store" } })
      : Response.redirect(new URL(`/invite?returnTo=${encodeURIComponent(`${url.pathname}${url.search}`)}`, url.origin), 302);
    return { request: sanitizedRequest, response, session: null, enabled: true };
  }

  headers.set("x-mokuang-invite-id", session.inviteId);
  headers.set("x-mokuang-invite-role", session.role);
  return { request: new Request(request, { headers }), response: null, session, enabled: true };
}

function isPublicInvitePath(pathname: string): boolean {
  return pathname === "/invite"
    || pathname.startsWith("/api/v1/invite/")
    || pathname === "/api/v1/health"
    || pathname === "/robots.txt"
    || pathname === "/sitemap.xml";
}

function isPublicAssetPath(pathname: string): boolean {
  return pathname.startsWith("/_next/")
    || pathname === "/_vinext/image"
    || pathname === "/favicon.svg"
    || pathname === "/og.png"
    || pathname === "/og-home-v2.png";
}

function isCacheableReaderRequest(request: Request): boolean {
  if (request.method !== "GET" || request.headers.has("rsc") || request.headers.has("next-router-state-tree")) return false;
  const pathname = new URL(request.url).pathname;
  return pathname === "/"
    || pathname === "/topics"
    || pathname.startsWith("/topics/")
    || pathname.startsWith("/events/")
    || pathname === "/api/v1/events";
}

function secureResponse(response: Response, inviteEnabled: boolean, cacheable = false): Response {
    const headers = new Headers(response.headers);
    headers.set("x-content-type-options", "nosniff");
    headers.set("x-frame-options", "DENY");
    headers.set("referrer-policy", "strict-origin-when-cross-origin");
    headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
    if (inviteEnabled) headers.set("x-robots-tag", "noindex, nofollow");
    if (cacheable && response.ok) headers.set("cache-control", "public, s-maxage=60, max-age=0");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

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
  "INGESTION_ANALYSIS_CONCURRENCY",
  "INGESTION_ANALYSIS_MODE",
  "EMAIL_PROVIDER",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "PUBLIC_SITE_URL",
  "INVITE_ACCESS_MODE",
  "INVITE_SESSION_SECRET",
] as const;

function readRuntimeEnvironment(env: Env): Record<string, string | undefined> {
  const nodeEnvironment = typeof process === "undefined" ? {} : process.env;
  return Object.fromEntries(runtimeEnvironmentKeys.map((key) => [
    key,
    typeof env[key] === "string" ? env[key] : nodeEnvironment[key],
  ]));
}

export default worker;
