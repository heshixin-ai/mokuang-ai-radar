import type { Metadata } from "next";
import { ReviewDashboard } from "@/components/review-dashboard";
import { SiteHeader } from "@/components/site-header";
import { requireReviewPageActor } from "@/lib/auth/review";
import Link from "@/components/site-link";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "采集与发布后台｜模况",
  description: "受控来源采集、候选分析、自动质量门禁与无人值守发布工作台。",
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
            <span className="section-label">STAGE 10 · LAUNCH READINESS</span>
            <h1>合格事件自动发布，<br />异常内容自动拦截。</h1>
            <p>可信一手来源的低风险候选，在聚类无歧义、引用完整且置信度不低于 70% 时自动发布；证据不足及政策、融资等高风险内容仍会拦截。</p>
            <Link className="operations-link" href="/review/operations">查看运行与质量监控 →</Link>
          </div>
          <div className="review-actor">
            <span>当前管理员</span>
            <strong>{actor.displayName}</strong>
            <small>{actor.email}</small>
          </div>
        </header>
        <ReviewDashboard />
      </section>
    </main>
  );
}
