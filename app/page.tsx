import { EventFeed } from "@/components/event-feed";
import { EventSectionButton, HomeScrollReset } from "@/components/event-section-link";
import { RadarPreview } from "@/components/radar-preview";
import { SiteHeader } from "@/components/site-header";
import { eventTypeLabels } from "@/lib/domain/labels";
import { curatedSources } from "@/lib/ingestion/sources";
import { isDemoEvent, listEvents } from "@/lib/repository/events";
import { listTopicTimelines } from "@/lib/repository/taxonomy";
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

export const dynamic = "force-dynamic";

export default async function Home() {
  const events = await listEvents();
  const demoMode = events.every(isDemoEvent);
  const previewEvents = events.slice(0, 3);
  let previewTopics: Array<{ slug: string; label: string; count: number }> = [];
  try {
    previewTopics = (await listTopicTimelines()).slice(0, 3);
  } catch {
    // Demo and render-test environments may not expose the production D1 binding.
  }
  if (previewTopics.length === 0) {
    const topicCounts = new Map<string, number>();
    for (const event of events) topicCounts.set(event.eventType, (topicCounts.get(event.eventType) ?? 0) + 1);
    previewTopics = [...topicCounts.entries()].map(([slug, count]) => ({
      slug,
      count,
      label: eventTypeLabels[slug as keyof typeof eventTypeLabels],
    })).slice(0, 3);
  }
  const feedReferenceTime = new Date().toISOString();

  return (
    <main className="home-v2">
      <HomeScrollReset />
      <aside className="home-announcement" aria-label="产品状态">
        <span>模况正在持续追踪 AI 产业变化</span>
        <EventSectionButton>查看今日情报 <span aria-hidden="true">→</span></EventSectionButton>
      </aside>

      <SiteHeader active="intel" />

      <section className="home-hero" id="top" aria-labelledby="home-title">
        <div className="home-eyebrow"><span /> AI PRODUCT &amp; MODEL RADAR</div>
        <h1 id="home-title"><span>只看 AI 真正</span><span>发生的变化</span></h1>
        <p>模况把分散的公告、文档与报道整理成可验证的事件。每天 10 分钟，看清发生了什么、影响谁、现在要做什么。</p>
        <div className="home-actions">
          <EventSectionButton className="home-primary-action">浏览今日变化</EventSectionButton>
        </div>
        <div className="home-status" id="stage-note">
          <span className="home-live-dot" />
          <strong>{demoMode ? "演示数据模式" : "正式事件持续更新"}</strong>
          <span>{curatedSources.length} 个受控来源 · AI 分析 · 安全门禁</span>
        </div>
      </section>

      <section className="product-proof" aria-label="模况产品界面预览">
        <RadarPreview
          events={previewEvents.map((event) => ({
            id: event.id,
            typeLabel: eventTypeLabels[event.eventType],
            title: event.titleZh,
            deck: event.deckZh,
          }))}
          topics={previewTopics}
          sourceCount={curatedSources.length}
        />
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

      <EventFeed events={events} referenceTime={feedReferenceTime} />

      <section className="home-subscribe-cta" aria-labelledby="subscribe-title">
        <span className="home-kicker">YOUR 10-MINUTE AI BRIEFING</span>
        <h2 id="subscribe-title"><span>不用追完所有新闻。</span><span>重要变化，模况替你盯着。</span></h2>
      </section>

      <footer className="site-footer home-footer">
        <div className="brand footer-brand">
          <span className="brand-mark">模</span>
          <span><strong>模况</strong><small>MOKUANG</small></span>
        </div>
        <p>AI 产品与模型变更雷达</p>
        <div className="footer-links"><Link href="/corrections">纠错</Link><Link href="/privacy">隐私</Link><Link href="/terms">条款</Link><a href="#top">顶部 ↑</a></div>
      </footer>
    </main>
  );
}
