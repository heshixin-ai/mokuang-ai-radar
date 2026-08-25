import { describe, expect, it } from "vitest";
import { buildLaunchFixtures, evaluateLaunchContract } from "@/lib/quality/evaluation";

describe("launch quality contract", () => {
  it("contains exactly 120 labeled synthetic regression cases", () => {
    const fixtures = buildLaunchFixtures();
    expect(fixtures).toHaveLength(120);
    expect(new Set(fixtures.map((fixture) => fixture.eventType))).toHaveLength(6);
    expect(fixtures.some((fixture) => fixture.expectedReady)).toBe(true);
    expect(fixtures.some((fixture) => !fixture.expectedReady)).toBe(true);
  });

  it("keeps every launch gate scenario stable", () => {
    expect(evaluateLaunchContract()).toMatchObject({ cases: 120, passed: 120, failed: 0, falseReady: 0, falseBlocked: 0 });
  });
});
