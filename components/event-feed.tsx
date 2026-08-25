"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { EventType, IntelligenceEvent } from "@/lib/domain/event";
import { eventStatusLabels, eventTypeLabels, roleLabels } from "@/lib/domain/labels";
import { EvidenceBadge } from "./evidence-badge";

const filters: Array<{ value: "all" | EventType; label: string }> = [
  { value: "all", label: "全部" },
  { value: "model_release", label: "模型" },
  { value: "api_change", label: "API" },
  { value: "pricing", label: "价格" },
  { value: "policy", label: "政策" },
  { value: "research", label: "研究" },
];

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function EventFeed({ events, demoMode = false }: { events: IntelligenceEvent[]; demoMode?: boolean }) {
  const [activeFilter, setActiveFilter] = useState<"all" | EventType>("all");
  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setIsHydrated(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const visibleEvents = useMemo(
    () => events.filter((event) => activeFilter === "all" || event.eventType === activeFilter),
    [activeFilter, events],
  );

  return (
    <section className="feed" id="events" aria-labelledby="feed-title" data-hydrated={isHydrated}>
      <div className="feed-toolbar">
        <div>
          <span className="section-label">TODAY&apos;S SIGNALS</span>
          <h2 id="feed-title">值得你处理的变化</h2>
          <p className="feed-count" aria-live="polite">当前显示 {visibleEvents.length} 条{demoMode ? "演示" : "已发布"}事件</p>
        </div>
        <div className="filter-row" aria-label="按事件类型筛选">
          {filters.map((filter) => (
            <button
              className={`filter ${activeFilter === filter.value ? "active" : ""}`}
              key={filter.value}
              onClick={() => setActiveFilter(filter.value)}
              type="button"
              aria-pressed={activeFilter === filter.value}
              disabled={!isHydrated}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {visibleEvents.length > 0 ? (
        <div className="event-list">
          {visibleEvents.map((event, index) => (
            <article className="event-card" key={event.id}>
              <div className="event-index">{String(index + 1).padStart(2, "0")}</div>
              <div className="event-body">
                <div className="event-meta">
                  <span className="event-type">{eventTypeLabels[event.eventType]}</span>
                  <time dateTime={event.publishedAt}>{dateFormatter.format(new Date(event.publishedAt))}</time>
                  <EvidenceBadge level={event.evidenceLevel} />
                  {event.needsReview && <span className="status-review">{eventStatusLabels[event.status]}</span>}
                </div>
                <h3><Link href={`/events/${event.id}`}>{event.titleZh}</Link></h3>
                <p>{event.deckZh}</p>
                <div className="event-footer">
                  <div className="role-list">
                    <span>影响</span>
                    {event.affectedRoles.filter((impact) => impact.level !== "none").map((impact) => (
                      <b key={impact.role}>{roleLabels[impact.role]}</b>
                    ))}
                  </div>
                  <Link className="detail-link" href={`/events/${event.id}`} aria-label={`查看 ${event.titleZh} 的证据`}>
                    查看依据 <span aria-hidden="true">↗</span>
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <strong>这个主题暂时没有事件</strong>
          <p>换一个筛选项，或等待新的正式事件通过发布门禁。</p>
        </div>
      )}
    </section>
  );
}
