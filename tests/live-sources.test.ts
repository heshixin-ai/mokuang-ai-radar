import { describe, expect, it } from "vitest";
import { fetchAndParseFeed } from "@/lib/ingestion/feed";
import { curatedSources } from "@/lib/ingestion/sources";

describe.runIf(process.env.RUN_LIVE_SOURCE_TESTS === "1")("live curated sources", () => {
  it("downloads and parses every registered official feed", async () => {
    const results: Array<{ id: string; count: number }> = [];
    for (let index = 0; index < curatedSources.length; index += 3) {
      results.push(...await Promise.all(curatedSources.slice(index, index + 3).map(async (source) => ({
        id: source.id,
        count: (await fetchAndParseFeed(source, { timeoutMs: 20_000 })).length,
      }))));
    }

    expect(results).toHaveLength(12);
    expect(results.filter((result) => result.count === 0)).toEqual([]);
  }, 120_000);
});
