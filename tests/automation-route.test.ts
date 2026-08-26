import { describe, expect, it, vi } from "vitest";
import { runCombinedAutomation } from "@/app/api/v1/admin/run/route";

describe("combined external automation route", () => {
  it("runs refresh before auto-publishing and returns one summary", async () => {
    const calls: string[] = [];
    const response = await runCombinedAutomation(makeRequest(), {
      refresh: vi.fn(async () => {
        calls.push("refresh");
        return Response.json({ data: { refresh: { insertedCount: 8 }, digest: { sent: 0 } } });
      }),
      autoPublish: vi.fn(async () => {
        calls.push("auto-publish");
        return Response.json({ data: { autoPublish: { attempted: 2, published: 2 } } });
      }),
    });

    expect(calls).toEqual(["refresh", "auto-publish"]);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        refresh: { insertedCount: 8 },
        autoPublish: { attempted: 2, published: 2 },
      },
      meta: { mode: "combined_external_automation", published: true },
    });
  });

  it("stops before auto-publishing when refresh fails", async () => {
    const autoPublish = vi.fn(async () => Response.json({ data: {} }));
    const response = await runCombinedAutomation(makeRequest(), {
      refresh: async () => Response.json({ error: { code: "REFRESH_FAILED" } }, { status: 502 }),
      autoPublish,
    });

    expect(response.status).toBe(502);
    expect(autoPublish).not.toHaveBeenCalled();
  });
});

function makeRequest() {
  return new Request("https://mokuang.example/api/v1/admin/run", {
    method: "POST",
    headers: { authorization: "Bearer test-token" },
  });
}
