import { describe, expect, it } from "vitest";
import { suggestCluster } from "@/lib/clustering/similarity";

const candidate = {
  id: "candidate-1",
  eventType: "model_release",
  titleZh: "GPT-5.6 发布并提升推理能力",
  whatChanged: "OpenAI 发布 GPT-5.6，更新推理能力与 API 设置。",
};

describe("candidate clustering", () => {
  it("suggests a merge for a strongly overlapping same-type event", () => {
    const result = suggestCluster(candidate, [{
      id: "event-1",
      eventType: "model_release",
      titleZh: "GPT-5.6 发布并提升推理能力",
      whatChanged: "OpenAI 发布 GPT-5.6，并更新推理与 API 设置。",
    }]);
    expect(result.action).toBe("merge_suggested");
    expect(result.targetEventId).toBe("event-1");
  });

  it("keeps incompatible versions separate", () => {
    const result = suggestCluster(candidate, [{
      id: "event-2",
      eventType: "model_release",
      titleZh: "GPT-5.5 发布并提升推理能力",
      whatChanged: "OpenAI 发布 GPT-5.5，更新推理能力与 API 设置。",
    }]);
    expect(result.action).toBe("create_new");
    expect(result.reasons).toContain("version_conflict_keep_separate");
  });

  it("does not compare different event types", () => {
    const result = suggestCluster(candidate, [{
      id: "event-3",
      eventType: "pricing",
      titleZh: candidate.titleZh,
      whatChanged: candidate.whatChanged,
    }]);
    expect(result.action).toBe("create_new");
    expect(result.reasons).toContain("no_same_type_event");
  });
});
