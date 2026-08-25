import { eventFilterSchema } from "@/lib/domain/event";
import { errorResponse } from "@/lib/http/error";
import { isDemoEvent, listEvents } from "@/lib/repository/events";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = eventFilterSchema.safeParse({
    type: url.searchParams.get("type") || undefined,
    status: url.searchParams.get("status") || undefined,
  });

  if (!parsed.success) {
    return errorResponse(400, "INVALID_FILTER", "筛选条件不受支持。");
  }

  const events = await listEvents(parsed.data);
  return Response.json({ data: events, meta: { count: events.length, demo: events.every(isDemoEvent) } });
}
