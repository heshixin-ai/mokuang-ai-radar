import { EventFeed } from "@/components/event-feed";
import { EventSectionButton, HomeScrollReset } from "@/components/event-section-link";
import { RadarPreview } from "@/components/radar-preview";
import { SiteHeader } from "@/components/site-header";
import { eventTypeLabels } from "@/lib/domain/labels";
import { curatedSources } from "@/lib/ingestion/sources";
import { isDemoEvent, listEvents } from "@/lib/repository/events";
import { listTopicTimelines } from "@/lib/repository/taxonomy";
import Link from "@/components/site-link";

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
