import { verifySubscription } from "@/lib/subscriptions/service";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ok = await verifySubscription(url.searchParams.get("token") ?? "");
  return Response.redirect(new URL(ok ? "/subscribe?verified=1" : "/subscribe?verified=0", url.origin), 303);
}
