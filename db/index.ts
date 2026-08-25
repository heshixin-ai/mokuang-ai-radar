import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

let runtimeBindings: { DB?: D1Database } = {};
try {
  runtimeBindings = (await import("cloudflare:workers")).env as { DB?: D1Database };
} catch {
  // Node-based render tests have no Cloudflare binding module. Public reads
  // already fall back safely; production Workers resolve this dynamic import.
}

export function getDb() {
  return drizzle(getD1(), { schema });
}

export function getD1(): D1Database {
  if (!runtimeBindings.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database.",
    );
  }

  return runtimeBindings.DB;
}
