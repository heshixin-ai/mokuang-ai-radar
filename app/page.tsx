import { EventFeed } from "@/components/event-feed";
import { SiteHeader } from "@/components/site-header";
import { eventTypeLabels } from "@/lib/domain/labels";
import { isDemoEvent, listEvents } from "@/lib/repository/events";
import Link from "@/components/site-link";

const productValues = [
  {
    number: "01",
    eyebrow: "CONTROLLED SOURCES",
    title: "受控来源，不追热点榜",
    text: "持续检查官方公告、API 文档、研究机构与可信媒体，只收录会影响判断和行动的变化。",
  },
  {
    number: "02",
    eyebrow: "EVENT FIRST",
    title: "一个变化，而不是十篇文章",
    text: "把描述同一件事的多条线索合并成事件，留下来源、冲突与证据等级，不制造重复噪音。",
  },
  {
    number: "03",
    eyebrow: "NEXT ACTION",
    title: "告诉你现在该做什么",
    text: "分别判断产品、开发、研究与创业者受到的影响，并给出可以立刻执行的下一步。",
  },
];

const workflow = [
  { number: "01", title: "发现", text: "每 5 分钟检查来源，识别具有时间意义的新变化。" },
  { number: "02", title: "判断", text: "完成去重、聚类与 AI 分析，同时保留不确定性。" },
  { number: "03", title: "核验", text: "官方高置信变化通过双重门禁后发布，高风险内容交由人工复核。" },
];

export const dynamic = "force-dynamic";

export default async function Home() {
  const events = await listEvents();
  const demoMode = events.every(isDemoEvent);
  const previewEvents = events.slice(0, 3);
  const latestPublishedAt = events[0]?.publishedAt;
  const previewStatus = demoMode
    ? "演示数据"
    : latestPublishedAt
      ? `更新于 ${new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(latestPublishedAt))}`
      : "等待更新";

  return (
    <main className="home-v2">
      <aside className="home-announcement" aria-label="产品状态">
        <span>模况正在持续追踪 AI 产业变化</span>
        <a href="#events">查看今日情报 <span aria-hidden="true">→</span></a>
      </aside>

      <SiteHeader active="intel" />

      <section className="home-hero" id="top" aria-labelledby="home-title">
        <div className="home-eyebrow"><span /> AI PRODUCT &amp; MODEL RADAR</div>
        <h1 id="home-title"><span>只看 AI 真正</span><span>发生的变化</span></h1>
        <p>模况把分散的公告、文档与报道整理成可验证的事件。每天 10 分钟，看清发生了什么、影响谁、现在要做什么。</p>
        <div className="home-actions">
          <a className="home-primary-action" href="#events">浏览今日变化 <span aria-hidden="true">→</span></a>
          <Link className="home-secondary-action" href="/subscribe">订阅每日情报</Link>
        </div>
        <div className="home-status" id="stage-note">
          <span className="home-live-dot" />
          <strong>{demoMode ? "演示数据模式" : "正式事件持续更新"}</strong>
          <span>20 个受控来源 · AI 分析 · 安全门禁</span>
        </div>
      </section>

      <section className="product-proof" aria-label="模况产品界面预览">
        <div className="radar-preview">
          <div className="preview-topbar">
            <div><span className="preview-logo">模</span><strong>模况情报台</strong></div>
            <span>LIVE RADAR</span>
          </div>
          <div className="preview-shell">
            <aside className="preview-sidebar">
              <p>工作台</p>
              <a className="active" href="#events"><span>今日情报</span><b>{events.length}</b></a>
              <Link href="/topics"><span>主题追踪</span><b>→</b></Link>
              <Link href="/entities"><span>实体档案</span><b>→</b></Link>
              <div className="preview-source-stat">
                <small>当前覆盖</small>
                <strong>20</strong>
                <span>个受控来源</span>
              </div>
            </aside>
            <div className="preview-main">
              <header>
                <div>
                  <span>DAILY BRIEFING</span>
                  <h2>今天值得处理的变化</h2>
                </div>
                <span className="preview-update-status" data-demo={demoMode || undefined} role="status">{previewStatus}</span>
              </header>
              <div className="preview-events">
                {previewEvents.length > 0 ? previewEvents.map((event, index) => (
                  <Link className="preview-event" href={`/events/${event.id}`} key={event.id}>
                    <span className="preview-event-index">{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <small>{eventTypeLabels[event.eventType]}</small>
                      <h3>{event.titleZh}</h3>
                      <p>{event.deckZh}</p>
                    </div>
                    <span className="preview-arrow" aria-hidden="true">↗</span>
                  </Link>
                )) : (
                  <div className="preview-empty">新的正式事件正在处理中。</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="home-values" aria-labelledby="value-title">
        <div className="home-section-heading">
          <span className="home-kicker">WHY MOKUANG</span>
          <h2 id="value-title">从新闻噪音里，<br />只留下决策信号。</h2>
        </div>
        <div className="value-grid">
          {productValues.map((value) => (
            <article className="value-card" key={value.number}>
              <div><span>{value.number}</span><small>{value.eyebrow}</small></div>
              <h3>{value.title}</h3>
              <p>{value.text}</p>
            </article>
          ))}
        </div>
      </section>

      <EventFeed events={events} demoMode={demoMode} />

      <section className="home-workflow" id="workflow" aria-labelledby="workflow-title">
        <div className="workflow-intro">
          <span className="home-kicker">HOW IT WORKS</span>
          <h2 id="workflow-title">机器提高速度，<br /><span>规则守住边界。</span></h2>
          <p>每条正式事件都要经过来源核验、结构化分析和质量门禁；价格、政策、冲突与低置信内容必须人工复核。</p>
        </div>
        <div className="home-workflow-list">
          {workflow.map((step) => (
            <article key={step.number}>
              <span>{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="home-final-cta" id="about">
        <span className="home-kicker">YOUR 10-MINUTE AI BRIEFING</span>
        <h2><span>不用追完所有新闻。</span><span>重要变化，模况替你盯着。</span></h2>
        <div>
          <Link className="home-primary-action" href="/subscribe">订阅每日情报 <span aria-hidden="true">→</span></Link>
          <Link href="/about">了解我们如何筛选</Link>
        </div>
      </section>

      <footer className="site-footer home-footer">
        <div className="brand footer-brand">
          <span className="brand-mark">模</span>
          <span><strong>模况</strong><small>MOKUANG</small></span>
        </div>
        <p>AI 产品与模型变更雷达</p>
        <div className="footer-links"><Link href="/about">关于</Link><Link href="/corrections">纠错</Link><Link href="/privacy">隐私</Link><Link href="/terms">条款</Link><a href="#top">顶部 ↑</a></div>
      </footer>
    </main>
  );
}
