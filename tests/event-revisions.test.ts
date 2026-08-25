import { describe, expect, it } from "vitest";
import { eventEditInputSchema } from "@/lib/events/types";

describe("event revision contract", () => {
  const valid = {
    titleZh: "GPT-5.6 API 设置更新并提升推理表现",
    deckZh: "新的推理保留与压缩设置改善基准表现。",
    whatChanged: "官方更新了 GPT-5.6 的 API 推理配置，并说明了适用场景与行为变化。",
    before: "旧配置没有保留跨请求推理状态。",
    after: "新配置可以保留推理状态并按需压缩。",
    whyItMatters: "产品团队可以在相同工作流中减少重复推理，同时改善复杂任务的结果稳定性。",
    recommendedAction: "在测试环境对比旧配置与新配置的质量、延迟和成本。",
    note: "人工核对官方来源并收紧表述",
  };

  it("accepts a complete human revision", () => {
    expect(eventEditInputSchema.parse(valid).titleZh).toContain("GPT-5.6");
  });

  it("requires an explicit revision note", () => {
    expect(() => eventEditInputSchema.parse({ ...valid, note: "" })).toThrow();
  });
});
