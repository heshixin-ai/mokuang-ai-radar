import { EventFeed } from "@/components/event-feed";
import { SiteHeader } from "@/components/site-header";
import { listEvents } from "@/lib/repository/events";
import Link from "next/link";

const workflow = [
  { number: "01", title: "发现变化", text: "从官方公告、API 文档、研究和可信报道中发现有时间意义的新变化。" },
  { number: "02", title: "合并证据", text: "把描述同一变化的多个来源归到一个事件，保留冲突和不确定性。" },
  { number: "03", title: "给出行动", text: "分别说明产品、开发和创业者是否受影响，以及最值得先检查什么。" },
];

export default function Home() {
  const events = listEvents();

  return (
    <main>
      <SiteHeader />

      <section className="hero" id="top">
        <div className="hero-kicker"><span /> AI 产品与模型变更雷达</div>
        <h1>跟上 AI 的变化，<br />不用追完所有新闻。</h1>
        <p>模况关注“变化”而不是“文章”。每天用 10 分钟，看清发生了什么、影响谁、现在要做什么。</p>
        <div className="hero-meta" id="stage-note">
          <span className="live-dot" />
          <strong>公开页仍为演示数据</strong>
          <span>第三阶段 · 真实采集与候选审核仅在内部后台运行</span>
        </div>
      </section>

      <EventFeed events={events} />

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
          <span className="section-label">STAGE 03</span>
          <h2>真实来源已接入，发布仍由人把关。</h2>
        </div>
        <div className="about-copy">
          <p>当前版本已能从受控官方 RSS 采集内容、去重、逐条生成候选并保存审核结果。公开信息流仍使用演示事件，定时更新、正式发布和每日邮件将在后续阶段接入。</p>
          <Link href="/api/v1/events">查看事件 API <span aria-hidden="true">↗</span></Link>
        </div>
      </section>

      <footer className="site-footer">
        <div className="brand footer-brand">
          <span className="brand-mark">模</span>
          <span><strong>模况</strong><small>MOKUANG</small></span>
        </div>
        <p>AI 产品与模型变更雷达 · Stage 03 Internal Review</p>
        <a href="#top">回到顶部 ↑</a>
      </footer>
    </main>
  );
}
