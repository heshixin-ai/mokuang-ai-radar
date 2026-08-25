import { EventFeed } from "@/components/event-feed";
import { SiteHeader } from "@/components/site-header";
import { isDemoEvent, listEvents } from "@/lib/repository/events";
import Link from "next/link";

const workflow = [
  { number: "01", title: "发现变化", text: "从官方公告、API 文档、研究和可信报道中发现有时间意义的新变化。" },
  { number: "02", title: "合并证据", text: "把描述同一变化的多个来源归到一个事件，保留冲突和不确定性。" },
  { number: "03", title: "给出行动", text: "分别说明产品、开发和创业者是否受影响，以及最值得先检查什么。" },
];

export const dynamic = "force-dynamic";

export default async function Home() {
  const events = await listEvents();
  const demoMode = events.every(isDemoEvent);

  return (
    <main>
      <SiteHeader />

      <section className="hero" id="top">
        <div className="hero-kicker"><span /> AI 产品与模型变更雷达</div>
        <h1>跟上 AI 的变化，<br />不用追完所有新闻。</h1>
        <p>模况关注“变化”而不是“文章”。每天用 10 分钟，看清发生了什么、影响谁、现在要做什么。</p>
        <div className="hero-meta" id="stage-note">
          <span className="live-dot" />
          <strong>{demoMode ? "首条正式事件发布前保留演示数据" : "公开事件来自人工发布"}</strong>
          <span>第十阶段 · 正式事件、订阅日报与运行监控已接通</span>
        </div>
      </section>

      <EventFeed events={events} demoMode={demoMode} />

      <section className="workflow-section" id="workflow" aria-labelledby="workflow-title">
        <div className="workflow-heading">
          <span className="section-label">FROM NOISE TO SIGNAL</span>
          <h2 id="workflow-title">不是摘要机器，<br />是变化判断系统。</h2>
        </div>
        <div className="workflow-list">
          {workflow.map((step) => (
            <article className="workflow-card" key={step.number}>
              <span>{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="about-section" id="about">
        <div>
          <span className="section-label">STAGE 10</span>
          <h2>从真实来源到正式事件，发布仍由人把关。</h2>
        </div>
        <div className="about-copy">
          <p>当前版本每 30 分钟检查 20 个受控来源，完成采集、去重、聚类、AI 分析与候选审核。正式草稿可人工修订并保留版本记录，通过质量门禁后才可发布；主题与实体时间线只展示正式事件。</p>
          <Link href="/api/v1/events">查看事件 API <span aria-hidden="true">↗</span></Link>
        </div>
      </section>

      <footer className="site-footer">
        <div className="brand footer-brand">
          <span className="brand-mark">模</span>
          <span><strong>模况</strong><small>MOKUANG</small></span>
        </div>
        <p>AI 产品与模型变更雷达 · Stage 10 Launch Readiness</p>
        <div className="footer-links"><Link href="/about">关于</Link><Link href="/corrections">纠错</Link><Link href="/privacy">隐私</Link><Link href="/terms">条款</Link><a href="#top">顶部 ↑</a></div>
      </footer>
    </main>
  );
}
