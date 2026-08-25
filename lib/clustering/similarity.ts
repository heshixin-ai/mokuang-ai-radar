import type { ClusterAction, ClusterCandidate, ClusterTarget } from "@/lib/clustering/types";

export type ClusterSuggestion = {
  action: ClusterAction;
  targetEventId: string | null;
  similarity: number;
  reasons: string[];
};

export function suggestCluster(candidate: ClusterCandidate, targets: ClusterTarget[]): ClusterSuggestion {
  const compatible = targets.filter((target) => target.eventType === candidate.eventType);
  if (compatible.length === 0) return createNew("no_same_type_event");

  const ranked = compatible
    .map((target) => ({ target, score: similarityScore(candidate, target) }))
    .sort((left, right) => right.score - left.score);
  const best = ranked[0];
  const candidateVersions = extractVersions(`${candidate.titleZh} ${candidate.whatChanged}`);
  const targetVersions = extractVersions(`${best.target.titleZh} ${best.target.whatChanged}`);
  const versionConflict = candidateVersions.size > 0
    && targetVersions.size > 0
    && !setsOverlap(candidateVersions, targetVersions);

  if (versionConflict) {
    return {
      action: "create_new",
      targetEventId: null,
      similarity: best.score,
      reasons: ["version_conflict_keep_separate"],
    };
  }
  if (best.score >= 0.72) {
    return {
      action: "merge_suggested",
      targetEventId: best.target.id,
      similarity: best.score,
      reasons: ["same_event_type", "high_semantic_overlap", "no_version_conflict"],
    };
  }
  if (best.score >= 0.45) {
    return {
      action: "manual_review",
      targetEventId: best.target.id,
      similarity: best.score,
      reasons: ["same_event_type", "ambiguous_overlap"],
    };
  }
  return createNew("low_similarity");
}

function similarityScore(candidate: ClusterCandidate, target: ClusterTarget): number {
  const left = featureSet(`${candidate.titleZh} ${candidate.whatChanged}`);
  const right = featureSet(`${target.titleZh} ${target.whatChanged}`);
  const intersection = [...left].filter((feature) => right.has(feature)).length;
  const union = new Set([...left, ...right]).size;
  if (union === 0) return 0;
  const jaccard = intersection / union;
  const subjectBoost = canonicalSubject(candidate.titleZh) === canonicalSubject(target.titleZh) ? 0.18 : 0;
  return Math.min(1, Number((jaccard * 0.82 + subjectBoost).toFixed(4)));
}

function featureSet(value: string): Set<string> {
  const normalized = value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}.+-]+/gu, " ").trim();
  const words = normalized.split(/\s+/).filter((word) => word.length > 1);
  const compact = normalized.replace(/\s+/g, "");
  const grams: string[] = [];
  for (let index = 0; index < compact.length - 1; index += 1) grams.push(compact.slice(index, index + 2));
  return new Set([...words, ...grams]);
}

function canonicalSubject(title: string): string {
  return title.split(/[｜|：:]/, 1)[0].normalize("NFKC").toLowerCase().replace(/\s+/g, "").trim();
}

function extractVersions(value: string): Set<string> {
  return new Set(value.toLowerCase().match(/\b(?:v?\d+(?:\.\d+){1,3}|gpt-?\d+(?:\.\d+)*)\b/g) ?? []);
}

function setsOverlap(left: Set<string>, right: Set<string>): boolean {
  return [...left].some((value) => right.has(value));
}

function createNew(reason: string): ClusterSuggestion {
  return { action: "create_new", targetEventId: null, similarity: 0, reasons: [reason] };
}
