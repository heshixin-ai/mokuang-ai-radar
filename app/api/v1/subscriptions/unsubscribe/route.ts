import { unsubscribe } from "@/lib/subscriptions/service";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ok = await unsubscribe(url.searchParams.get("token") ?? "");
  return Response.redirect(new URL(ok ? "/subscribe?unsubscribed=1" : "/subscribe?unsubscribed=0", url.origin), 303);
}
