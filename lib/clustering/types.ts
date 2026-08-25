import { z } from "zod";

export const clusterActionSchema = z.enum(["create_new", "merge_suggested", "manual_review"]);
export const clusterStatusSchema = z.enum(["proposed", "confirmed", "dismissed"]);

export const clusterDecisionViewSchema = z.object({
  id: z.string(),
  candidateId: z.string(),
  candidateTitle: z.string(),
  action: clusterActionSchema,
  targetEventId: z.string().nullable(),
  targetEventTitle: z.string().nullable(),
  similarity: z.number().min(0).max(1),
  reasons: z.array(z.string()),
  status: clusterStatusSchema,
  decidedBy: z.enum(["rules", "reviewer"]),
  reviewedAt: z.string().nullable(),
  reviewedBy: z.string().nullable(),
  reviewNote: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const clusterDashboardSchema = z.object({
  decisions: z.array(clusterDecisionViewSchema),
  counts: z.object({
    proposed: z.number().int().nonnegative(),
    merged: z.number().int().nonnegative(),
    separate: z.number().int().nonnegative(),
  }),
});

export type ClusterAction = z.infer<typeof clusterActionSchema>;
export type ClusterDecisionView = z.infer<typeof clusterDecisionViewSchema>;
export type ClusterDashboard = z.infer<typeof clusterDashboardSchema>;

export type ClusterCandidate = {
  id: string;
  eventType: string;
  titleZh: string;
  whatChanged: string;
};

export type ClusterTarget = {
  id: string;
  eventType: string;
  titleZh: string;
  whatChanged: string;
};
