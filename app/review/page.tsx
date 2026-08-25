import type { Metadata } from "next";
import { ReviewDashboard } from "@/components/review-dashboard";
import { SiteHeader } from "@/components/site-header";
import { requireReviewPageActor } from "@/lib/auth/review";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "采集与审核后台｜模况",
  description: "受控来源采集、候选分析和人工审核工作台。",
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
            <span className="section-label">STAGE 05 · COVERAGE REVIEW</span>
            <h1>把来源变成候选，<br />把发布留给人。</h1>
            <p>从登记的 RSS、Release 与公开更新页采集，再逐条调用 AI 分析。批准只进入后续发布准备，不会直接出现在公开信息流。</p>
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
