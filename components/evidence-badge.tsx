import { evidenceLevelLabels } from "@/lib/domain/labels";
import type { EvidenceLevel } from "@/lib/domain/event";

export function EvidenceBadge({ level }: { level: EvidenceLevel }) {
  return <span className={`evidence-badge evidence-${level}`}>{evidenceLevelLabels[level]}</span>;
}
