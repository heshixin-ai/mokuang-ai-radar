import type { EvidenceLevel, EventStatus, EventType } from "./event";

export const eventTypeLabels: Record<EventType, string> = {
  model_release: "模型发布",
  api_change: "API 变更",
  pricing: "价格变化",
  policy: "政策动态",
  funding: "融资",
  research: "研究进展",
};

export const evidenceLevelLabels: Record<EvidenceLevel, string> = {
  official: "官方来源",
  corroborated: "交叉验证",
  reported: "可信报道",
  lead_only: "待核线索",
};

export const eventStatusLabels: Record<EventStatus, string> = {
  candidate: "候选",
  needs_review: "等待审核",
  published: "已发布",
  rejected: "已拒绝",
};

export const roleLabels = {
  product: "产品经理",
  developer: "开发者",
  founder: "创始人",
  researcher: "研究者",
} as const;
