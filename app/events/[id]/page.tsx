import type { Metadata } from "next";
import Link from "@/components/site-link";
import { notFound } from "next/navigation";
import { EvidenceBadge } from "@/components/evidence-badge";
import { SiteHeader } from "@/components/site-header";
import { eventStatusLabels, eventTypeLabels, roleLabels } from "@/lib/domain/labels";
import { getEventById, isDemoEvent } from "@/lib/repository/events";

type EventPageProps = { params: Promise<{ id: string }> };

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Shanghai",
});

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeZone: "Asia/Shanghai",
});

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

  const sourceById = new Map(event.sources.map((source) => [source.id, source]));

  return (
    <main>
      <SiteHeader />
      <article className="detail-shell">
        <Link className="back-link" href="/#events">← 返回情报列表</Link>

        <header className="detail-header">
          <div className="detail-meta">
            <span className="event-type">{eventTypeLabels[event.eventType]}</span>
            <EvidenceBadge level={event.evidenceLevel} />
            <span>{eventStatusLabels[event.status]}</span>
            <span>置信度 {Math.round(event.confidence * 100)}%</span>
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
                  <div><span>变化后</span><p>{event.after ?? "来源之间仍有冲突，等待人工核对。"}</p></div>
                </div>
              </div>
            </section>

            <section className="detail-section" aria-labelledby="impact-title">
              <span className="detail-number">02</span>
              <div>
                <h2 id="impact-title">为什么重要</h2>
                <p className="detail-lead">{event.whyItMatters}</p>
                <div className="impact-list">
                  {event.affectedRoles.map((impact) => (
                    <div className="impact-item" key={impact.role}>
                      <div><strong>{roleLabels[impact.role]}</strong><span className={`impact-level level-${impact.level}`}>{impact.level}</span></div>
                      <p>{impact.impact ?? "暂无直接影响。"}</p>
                    </div>
                  ))}
                </div>
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
                <div className="citation-list">
                  {event.citations.map((citation, index) => {
                    const source = sourceById.get(citation.sourceId);
                    return (
                      <article className="citation-card" key={citation.id}>
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <div>
                          <p>{citation.claim}</p>
                          {source && <a href={source.url} target="_blank" rel="noreferrer">{source.publisher} · {source.title} ↗</a>}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </section>
          </div>

          <aside className="detail-aside" aria-label="事件记录">
            <h2>事件记录</h2>
            <dl>
              <div><dt>发布时间</dt><dd><time dateTime={event.publishedAt}>{dateTimeFormatter.format(new Date(event.publishedAt))}</time></dd></div>
              <div><dt>生效时间</dt><dd>{event.effectiveAt ? dateFormatter.format(new Date(event.effectiveAt)) : "待确认"}</dd></div>
              <div><dt>来源数量</dt><dd>{event.sources.length} 个</dd></div>
              <div><dt>生成模型</dt><dd>{event.modelId}</dd></div>
              <div><dt>Prompt</dt><dd>{event.promptVersion}</dd></div>
            </dl>
            {event.needsReview && (
              <div className="review-box">
                <strong>需要人工审核</strong>
                <ul>{event.reviewReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
              </div>
            )}
          </aside>
        </div>
      </article>
    </main>
  );
}
