"use client";

import Link from "@/components/site-link";
import { useEffect, useMemo, useState } from "react";
import type { EventType, IntelligenceEvent } from "@/lib/domain/event";
import { eventStatusLabels, eventTypeLabels, roleLabels } from "@/lib/domain/labels";
import {
  EVENT_PAGE_SIZE,
  filterEventsByTime,
  filterEventsByType,
  type EventTimeRange,
} from "@/lib/events/feed-filter";
import { EvidenceBadge } from "./evidence-badge";

const filters: Array<{ value: "all" | EventType; label: string }> = [
  { value: "all", label: "全部类型" },
  { value: "model_release", label: "模型" },
  { value: "api_change", label: "API" },
  { value: "pricing", label: "价格" },
  { value: "policy", label: "政策" },
  { value: "research", label: "研究" },
];

const timeRanges: Array<{ value: EventTimeRange; label: string }> = [
  { value: "today", label: "今天" },
  { value: "7d", label: "近 7 天" },
  { value: "30d", label: "近 30 天" },
  { value: "all", label: "全部历史" },
];

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "short",
  day: "numeric",
});

export function EventFeed({
  events,
  demoMode = false,
  referenceTime,
}: {
  events: IntelligenceEvent[];
  demoMode?: boolean;
  referenceTime: string;
}) {
  const [activeFilter, setActiveFilter] = useState<"all" | EventType>("all");
  const [activeTimeRange, setActiveTimeRange] = useState<EventTimeRange>("7d");
  const [visibleCount, setVisibleCount] = useState(EVENT_PAGE_SIZE);
  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => {
    let hashTimeout = 0;
    const scrollToEvents = () => {
      const root = document.documentElement;
      const previousScrollBehavior = root.style.scrollBehavior;
      root.style.scrollBehavior = "auto";
      document.getElementById("events")?.scrollIntoView({ block: "start" });
      root.style.scrollBehavior = previousScrollBehavior;
    };
    const frame = window.requestAnimationFrame(() => {
      setIsHydrated(true);
      if (window.location.hash === "#events") {
        scrollToEvents();
        hashTimeout = window.setTimeout(scrollToEvents, 250);
      }
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(hashTimeout);
    };
  }, []);
  const eventsInRange = useMemo(
    () => filterEventsByTime(events, activeTimeRange, referenceTime),
    [activeTimeRange, events, referenceTime],
  );
  const filteredEvents = useMemo(
    () => filterEventsByType(eventsInRange, activeFilter),
    [activeFilter, eventsInRange],
  );
  const visibleEvents = filteredEvents.slice(0, visibleCount);
  const filterCounts = useMemo(
    () => Object.fromEntries(filters.map((filter) => [
      filter.value,
      filter.value === "all" ? eventsInRange.length : eventsInRange.filter((event) => event.eventType === filter.value).length,
    ])) as Record<"all" | EventType, number>,
    [eventsInRange],
  );
  const remainingCount = Math.max(filteredEvents.length - visibleEvents.length, 0);

  function changeTimeRange(range: EventTimeRange) {
    setActiveTimeRange(range);
    setVisibleCount(EVENT_PAGE_SIZE);
  }

  function changeTypeFilter(type: "all" | EventType) {
    setActiveFilter(type);
    setVisibleCount(EVENT_PAGE_SIZE);
  }

  return (
    <section className="feed" id="events" aria-labelledby="feed-title" data-hydrated={isHydrated}>
      <div className="feed-toolbar">
        <div>
          <span className="section-label">AI CHANGE FEED</span>
          <h2 id="feed-title">值得你处理的变化</h2>
          <p className="feed-count" aria-live="polite">
            当前显示 {visibleEvents.length} / {filteredEvents.length} 条{demoMode ? "演示" : "已发布"}事件
          </p>
        </div>
        <div className="feed-controls">
          <label className="time-filter">
            <span>时间</span>
            <select
              value={activeTimeRange}
              onChange={(event) => changeTimeRange(event.target.value as EventTimeRange)}
              disabled={!isHydrated}
              aria-label="按发布时间筛选事件"
            >
              {timeRanges.map((range) => <option value={range.value} key={range.value}>{range.label}</option>)}
            </select>
          </label>
          <div className="type-filter-group">
            <span>类型</span>
            <div className="filter-row" aria-label="按事件类型筛选">
              {filters.map((filter) => {
                const count = filterCounts[filter.value];
                const unavailable = filter.value !== "all" && count === 0;

                return (
                  <button
                    className={`filter ${activeFilter === filter.value ? "active" : ""}`}
                    key={filter.value}
                    onClick={() => changeTypeFilter(filter.value)}
                    type="button"
                    aria-pressed={activeFilter === filter.value}
                    aria-label={`${filter.label}，${count} 条事件`}
                    disabled={!isHydrated || unavailable}
                    title={unavailable ? "当前时间范围内暂无这类事件" : undefined}
                  >
                    {filter.label}<small aria-hidden="true">{count}</small>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {visibleEvents.length > 0 ? (
        <div className="event-list">
          {visibleEvents.map((event, index) => (
            <article className="event-card" key={event.id}>
              <Link className="event-card-link" href={`/events/${event.id}`} aria-label={`查看 ${event.titleZh} 的完整详情与证据`}>
                <div className="event-index">{String(index + 1).padStart(2, "0")}</div>
                <div className="event-body">
                  <div className="event-meta">
                    <span className="event-type">{eventTypeLabels[event.eventType]}</span>
                    <time dateTime={event.publishedAt}>{dateFormatter.format(new Date(event.publishedAt))}</time>
                    <EvidenceBadge level={event.evidenceLevel} />
                    {event.needsReview && <span className="status-review">{eventStatusLabels[event.status]}</span>}
                  </div>
                  <h3>{event.titleZh}</h3>
                  <p>{event.deckZh}</p>
                  <div className="event-footer">
                    <div className="role-list">
                      <span>影响</span>
                      {event.affectedRoles.filter((impact) => impact.level !== "none").map((impact) => (
                        <b key={impact.role}>{roleLabels[impact.role]}</b>
                      ))}
                    </div>
                    <span className="detail-link">
                      查看完整详情 <span aria-hidden="true">↗</span>
                    </span>
                  </div>
                </div>
              </Link>
            </article>
          ))}
          {remainingCount > 0 && (
            <div className="feed-load-more">
              <button type="button" onClick={() => setVisibleCount((count) => count + EVENT_PAGE_SIZE)}>
                加载更多
                <small>再显示 {Math.min(EVENT_PAGE_SIZE, remainingCount)} 条</small>
              </button>
              <span>还有 {remainingCount} 条事件</span>
            </div>
          )}
        </div>
      ) : (
        <div className="empty-state">
          <strong>当前筛选范围内没有事件</strong>
          <p>可以扩大时间范围、切换类型，或等待新的正式事件发布。</p>
        </div>
      )}
    </section>
  );
}
