import type { Metadata } from "next";
import { ReviewDashboard } from "@/components/review-dashboard";
import { SiteHeader } from "@/components/site-header";
import { requireReviewPageActor } from "@/lib/auth/review";
import Link from "@/components/site-link";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "采集、审核与发布后台｜模况",
  description: "受控来源采集、候选分析、安全自动发布与高风险人工复核工作台。",
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
            <h1>低风险交给规则，<br />高风险交给人。</h1>
            <p>官方高置信候选只有在聚类无歧义、引用完整且质量门禁通过时才可安全自动发布；价格、政策、融资、冲突和低置信内容仍必须人工复核。</p>
            <Link className="operations-link" href="/review/operations">查看运行与质量监控 →</Link>
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
