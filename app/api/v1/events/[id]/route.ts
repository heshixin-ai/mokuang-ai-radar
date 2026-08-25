import { errorResponse } from "@/lib/http/error";
import { getEventById, isDemoEvent } from "@/lib/repository/events";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const event = await getEventById(id);

  if (!event) {
    return errorResponse(404, "EVENT_NOT_FOUND", "没有找到这个变化事件。");
  }

  return Response.json({ data: event, meta: { demo: isDemoEvent(event) } });
}
