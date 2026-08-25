import type { Metadata } from "next";
import { ReviewDashboard } from "@/components/review-dashboard";
import { SiteHeader } from "@/components/site-header";
import { requireReviewPageActor } from "@/lib/auth/review";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "采集、审核与发布后台｜模况",
  description: "受控来源采集、候选分析、正式事件草稿与人工发布工作台。",
  robots: { index: false, follow: false },
};

export default async function ReviewPage() {
  const actor = await requireReviewPageActor();
  return (
    <main>
      <SiteHeader />
      <section className="review-shell">
        <header className="review-hero">
          <div>
            <span className="section-label">STAGE 06 · EVENT PUBLISHING</span>
            <h1>先把事实变成草稿，<br />再把发布交给人。</h1>
            <p>从受控来源采集并逐条分析；候选批准后生成带引用的正式事件草稿。只有通过质量门禁并由审核员再次确认，才会进入公开信息流。</p>
          </div>
          <div className="review-actor">
            <span>当前审核员</span>
            <strong>{actor.displayName}</strong>
            <small>{actor.email}</small>
          </div>
        </header>
        <ReviewDashboard />
      </section>
    </main>
  );
}
