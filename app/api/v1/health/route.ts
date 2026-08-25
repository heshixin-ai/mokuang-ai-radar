import { getD1 } from "@/db";

export async function GET() {
  try {
    await getD1().prepare("SELECT 1 AS ok").first();
    return Response.json({ status: "ok", database: "reachable", checkedAt: new Date().toISOString() }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ status: "degraded", database: "unreachable", checkedAt: new Date().toISOString() }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
