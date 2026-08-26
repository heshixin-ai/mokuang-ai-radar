import { POST as runAutoPublish } from "@/app/api/v1/admin/auto-publish/route";
import { POST as runRefresh } from "@/app/api/v1/admin/refresh/route";

type AutomationHandler = (request: Request) => Promise<Response>;

export async function POST(request: Request) {
  return runCombinedAutomation(request);
}

export async function runCombinedAutomation(
  request: Request,
  handlers: { refresh: AutomationHandler; autoPublish: AutomationHandler } = {
    refresh: runRefresh,
    autoPublish: runAutoPublish,
  },
) {
  const startedAt = Date.now();
  const refreshResponse = await handlers.refresh(forwardRequest(request));
  if (!refreshResponse.ok) return refreshResponse;
  const refreshPayload = await refreshResponse.json() as {
    data?: { refresh?: unknown; digest?: unknown };
  };

  const autoPublishResponse = await handlers.autoPublish(forwardRequest(request));
  if (!autoPublishResponse.ok) return autoPublishResponse;
  const autoPublishPayload = await autoPublishResponse.json() as {
    data?: { autoPublish?: { published?: number } };
  };
  const published = autoPublishPayload.data?.autoPublish?.published ?? 0;

  console.log("mokuang_combined_automation", JSON.stringify({
    published,
    durationMs: Date.now() - startedAt,
  }));

  return Response.json({
    data: {
      refresh: refreshPayload.data?.refresh ?? null,
      digest: refreshPayload.data?.digest ?? null,
      autoPublish: autoPublishPayload.data?.autoPublish ?? null,
    },
    meta: {
      mode: "combined_external_automation",
      durationMs: Date.now() - startedAt,
      published: published > 0,
    },
  }, { headers: { "cache-control": "no-store" } });
}

function forwardRequest(request: Request): Request {
  return new Request(request.url, {
    method: "POST",
    headers: new Headers(request.headers),
  });
}
