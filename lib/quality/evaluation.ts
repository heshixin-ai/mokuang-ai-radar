export type QualityFixture = {
  id: string;
  eventType: string;
  hasCitation: boolean;
  confidence: number;
  evidenceLevel: "official" | "corroborated" | "reported" | "lead_only";
  hasHighRiskReview: boolean;
  expectedReady: boolean;
};

export type QualityEvaluationReport = {
  suite: "deterministic_launch_contract";
  fixtureKind: "synthetic_regression_not_human_gold";
  cases: number;
  passed: number;
  failed: number;
  passRate: number;
  falseReady: number;
  falseBlocked: number;
};

const eventTypes = ["model_release", "api_change", "pricing", "policy", "funding", "research"] as const;

export function buildLaunchFixtures(): QualityFixture[] {
  return eventTypes.flatMap((eventType) => Array.from({ length: 20 }, (_, index) => {
    const hasCitation = index % 5 !== 1;
    const confidence = index % 5 === 2 ? 0.72 : 0.9;
    const evidenceLevel = index % 5 === 3 ? "lead_only" as const : index % 2 === 0 ? "official" as const : "corroborated" as const;
    const highRisk = ["pricing", "policy", "funding"].includes(eventType);
    const hasHighRiskReview = !highRisk || index % 5 !== 4;
    const expectedReady = hasCitation && confidence >= 0.8 && evidenceLevel !== "lead_only" && hasHighRiskReview;
    return { id: `${eventType}-${String(index + 1).padStart(2, "0")}`, eventType, hasCitation, confidence, evidenceLevel, hasHighRiskReview, expectedReady };
  }));
}

export function assessLaunchFixture(fixture: QualityFixture): boolean {
  if (!fixture.hasCitation || fixture.confidence < 0.8 || fixture.evidenceLevel === "lead_only") return false;
  if (["pricing", "policy", "funding"].includes(fixture.eventType) && !fixture.hasHighRiskReview) return false;
  return true;
}

export function evaluateLaunchContract(fixtures: QualityFixture[] = buildLaunchFixtures()): QualityEvaluationReport {
  let passed = 0; let falseReady = 0; let falseBlocked = 0;
  for (const fixture of fixtures) {
    const actual = assessLaunchFixture(fixture);
    if (actual === fixture.expectedReady) passed += 1;
    else if (actual) falseReady += 1;
    else falseBlocked += 1;
  }
  return {
    suite: "deterministic_launch_contract",
    fixtureKind: "synthetic_regression_not_human_gold",
    cases: fixtures.length,
    passed,
    failed: fixtures.length - passed,
    passRate: fixtures.length === 0 ? 0 : passed / fixtures.length,
    falseReady,
    falseBlocked,
  };
}
