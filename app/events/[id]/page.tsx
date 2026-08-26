import type { Metadata } from "next";
import Link from "@/components/site-link";
import { notFound } from "next/navigation";
import { EvidenceBadge } from "@/components/evidence-badge";
import { SiteHeader } from "@/components/site-header";
import { eventTypeLabels, roleLabels } from "@/lib/domain/labels";
import { getEventSourcePublishedAt } from "@/lib/events/publication-time";
import { getEventById, isDemoEvent } from "@/lib/repository/events";

type EventPageProps = { params: Promise<{ id: string }> };

const sourceDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "long",
  day: "numeric",
});

const impactLevelLabels = {
  high: "高影响",
  medium: "中影响",
  low: "低影响",
  none: "无直接影响",
} as const;

export async function generateMetadata({ params }: EventPageProps): Promise<Metadata> {
  const { id } = await params;
  const event = await getEventById(id);
  if (!event) return { title: "事件不存在｜模况" };

  return {
    title: `${event.titleZh}｜模况`,
    description: event.deckZh,
    openGraph: { title: event.titleZh, description: event.deckZh, type: "article", images: [] },
    twitter: { card: "summary", title: event.titleZh, description: event.deckZh, images: [] },
  };
}

export default async function EventPage({ params }: EventPageProps) {
  const { id } = await params;
  const event = await getEventById(id);
  if (!event) notFound();
  const demoMode = isDemoEvent(event);
  const sourcePublishedAt = getEventSourcePublishedAt(event);
  const visibleImpacts = event.affectedRoles.filter((impact) => impact.level !== "none");
  const sourceGroups = event.sources
    .map((source) => ({
      source,
      citations: event.citations.filter((citation) => citation.sourceId === source.id),
    }))
    .filter((group) => group.citations.length > 0);

  return (
    <main className="detail-v2" id="top">
      <SiteHeader active="intel" />
      <article className="detail-shell">
        <Link className="back-link" href="/#events"><span aria-hidden="true">←</span> 返回情报列表</Link>

        <header className="detail-header">
          <div className="detail-meta">
            <span className="event-type">{eventTypeLabels[event.eventType]}</span>
            <EvidenceBadge level={event.evidenceLevel} />
            {sourcePublishedAt && (
              <time dateTime={sourcePublishedAt}>{sourceDateFormatter.format(new Date(sourcePublishedAt))}</time>
            )}
          </div>
          <h1>{event.titleZh}</h1>
          <p>{event.deckZh}</p>
          {demoMode && <div className="demo-ribbon">演示事件 · 所有厂商、产品和来源名称均为样例</div>}
        </header>

        <div className="detail-grid">
          <div className="detail-main">
            <section className="detail-section" aria-labelledby="change-title">
              <span className="detail-number">01</span>
              <div>
                <h2 id="change-title">发生了什么</h2>
                <p className="detail-lead">{event.whatChanged}</p>
                <div className="change-grid">
                  <div><span>变化前</span><p>{event.before ?? "来源没有提供可核验的旧状态。"}</p></div>
                  <div><span>变化后</span><p>{event.after ?? "来源之间仍有冲突，暂未形成可发布结论。"}</p></div>
                </div>
              </div>
            </section>

            <section className="detail-section" aria-labelledby="impact-title">
              <span className="detail-number">02</span>
              <div>
                <h2 id="impact-title">为什么重要</h2>
                <p className="detail-lead">{event.whyItMatters}</p>
                {visibleImpacts.length > 0 && <div className="impact-list">
                  {visibleImpacts.map((impact) => (
                    <div className="impact-item" key={impact.role}>
                      <div>
                        <strong>{roleLabels[impact.role]}</strong>
                        <span className={`impact-level level-${impact.level}`}>{impactLevelLabels[impact.level]}</span>
                      </div>
                      <p>{impact.impact ?? "暂无直接影响。"}</p>
                    </div>
                  ))}
                </div>}
              </div>
            </section>

            <section className="detail-section" aria-labelledby="action-title">
              <span className="detail-number">03</span>
              <div>
                <h2 id="action-title">建议行动</h2>
                <div className="action-box">{event.recommendedAction ?? "继续观察，暂不采取行动。"}</div>
              </div>
            </section>

            <section className="detail-section" aria-labelledby="evidence-title">
              <span className="detail-number">04</span>
              <div>
                <h2 id="evidence-title">证据与来源</h2>
                <div className="source-group-list">
                  {sourceGroups.map(({ source, citations }, index) => (
                    <article className="source-group-card" key={source.id}>
                      <header>
                        <span>来源 {String(index + 1).padStart(2, "0")}</span>
                        <a href={source.url} target="_blank" rel="noreferrer">查看原文 <span aria-hidden="true">↗</span></a>
                      </header>
                      <h3>{source.title}</h3>
                      <p className="source-publisher">
                        {source.publisher} · {sourceDateFormatter.format(new Date(source.publishedAt))}
                      </p>
                      <ul>
                        {citations.map((citation) => <li key={citation.id}>{citation.claim}</li>)}
                      </ul>
                    </article>
                  ))}
                </div>
              </div>
            </section>
          </div>

        </div>
      </article>
      <footer className="site-footer detail-footer">
        <Link className="brand footer-brand" href="/" aria-label="模况首页">
          <span className="brand-mark">模</span>
          <span><strong>模况</strong><small>MOKUANG</small></span>
        </Link>
        <p>AI 产品与模型变更雷达</p>
        <div className="footer-links">
          <Link href="/corrections">纠错</Link>
          <Link href="/privacy">隐私</Link>
          <Link href="/terms">条款</Link>
          <a href="#top">顶部 ↑</a>
        </div>
      </footer>
    </main>
  );
}
