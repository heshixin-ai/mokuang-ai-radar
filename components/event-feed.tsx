"use client";

import Link from "@/components/site-link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { EventType, IntelligenceEvent } from "@/lib/domain/event";
import { eventStatusLabels, eventTypeLabels, roleLabels } from "@/lib/domain/labels";
import {
  EVENT_PAGE_SIZE,
  filterEventsByTime,
  filterEventsByType,
  type EventTimeRange,
} from "@/lib/events/feed-filter";
import { getEventSourcePublishedAt } from "@/lib/events/publication-time";
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

type FilterOption<T extends string> = {
  value: T;
  label: string;
  count?: number;
  disabled?: boolean;
};

function FilterMenu<T extends string>({
  id,
  label,
  value,
  options,
  isOpen,
  disabled,
  onToggle,
  onChange,
}: {
  id: string;
  label: string;
  value: T;
  options: Array<FilterOption<T>>;
  isOpen: boolean;
  disabled: boolean;
  onToggle: () => void;
  onChange: (value: T) => void;
}) {
  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <div className={`feed-filter-menu${isOpen ? " is-open" : ""}`}>
      <button
        className="feed-filter-trigger"
        type="button"
        id={`${id}-trigger`}
        aria-label={`按${label}筛选，当前为${selected.label}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={`${id}-options`}
        disabled={disabled}
        onClick={onToggle}
      >
        <span className="feed-filter-label">{label}：</span>
        <strong>{selected.label}</strong>
        <span className="feed-filter-chevron" aria-hidden="true">⌄</span>
      </button>
      {isOpen && (
        <div
          className="feed-filter-options"
          id={`${id}-options`}
          role="listbox"
          aria-labelledby={`${id}-trigger`}
        >
          {options.map((option) => (
            <button
              type="button"
              role="option"
              aria-selected={option.value === value}
              className="feed-filter-option"
              disabled={option.disabled}
              key={option.value}
              onClick={() => onChange(option.value)}
            >
              <span className="feed-filter-check" aria-hidden="true">
                {option.value === value ? "✓" : ""}
              </span>
              <span>{option.label}</span>
              {option.count !== undefined && <b>{option.count}</b>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "short",
  day: "numeric",
});

export function EventFeed({
  events,
  referenceTime,
}: {
  events: IntelligenceEvent[];
  referenceTime: string;
}) {
  const [activeFilter, setActiveFilter] = useState<"all" | EventType>("all");
  const [activeTimeRange, setActiveTimeRange] = useState<EventTimeRange>("7d");
  const [visibleCount, setVisibleCount] = useState(EVENT_PAGE_SIZE);
  const [isHydrated, setIsHydrated] = useState(false);
  const [openMenu, setOpenMenu] = useState<"type" | "time" | null>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
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
  useEffect(() => {
    if (!openMenu) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!controlsRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openMenu]);
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
    setOpenMenu(null);
  }

  function changeTypeFilter(type: "all" | EventType) {
    setActiveFilter(type);
    setVisibleCount(EVENT_PAGE_SIZE);
    setOpenMenu(null);
  }

  return (
    <section className="feed" id="events" aria-labelledby="feed-title" data-hydrated={isHydrated}>
      <div className="feed-toolbar">
        <div>
          <span className="section-label">AI CHANGE FEED</span>
          <h2 id="feed-title">值得你处理的变化</h2>
        </div>
        <div className="feed-controls" ref={controlsRef}>
          <FilterMenu
            id="event-type-filter"
            label="类型"
            value={activeFilter}
            options={filters.map((filter) => ({
              ...filter,
              count: filter.value === "all" ? undefined : filterCounts[filter.value],
              disabled: filter.value !== "all" && filterCounts[filter.value] === 0,
            }))}
            isOpen={openMenu === "type"}
            disabled={!isHydrated}
            onToggle={() => setOpenMenu((current) => current === "type" ? null : "type")}
            onChange={changeTypeFilter}
          />
          <FilterMenu
            id="event-time-filter"
            label="时间"
            value={activeTimeRange}
            options={timeRanges}
            isOpen={openMenu === "time"}
            disabled={!isHydrated}
            onToggle={() => setOpenMenu((current) => current === "time" ? null : "time")}
            onChange={changeTimeRange}
          />
        </div>
      </div>

      {visibleEvents.length > 0 ? (
        <div className="event-list">
          {visibleEvents.map((event, index) => {
            const sourcePublishedAt = getEventSourcePublishedAt(event);
            return (
            <article className="event-card" key={event.id}>
              <Link className="event-card-link" href={`/events/${event.id}`} aria-label={`查看 ${event.titleZh} 的完整详情与证据`}>
                <div className="event-index">{String(index + 1).padStart(2, "0")}</div>
                <div className="event-body">
                  <div className="event-meta">
                    <span className="event-type">{eventTypeLabels[event.eventType]}</span>
                    {sourcePublishedAt && (
                      <time dateTime={sourcePublishedAt}>
                        {dateFormatter.format(new Date(sourcePublishedAt))}
                      </time>
                    )}
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
            );
          })}
          {remainingCount > 0 && (
            <div className="feed-load-more">
              <button
                type="button"
                onClick={() => setVisibleCount((count) => count + EVENT_PAGE_SIZE)}
                aria-label="加载更多事件"
              >
                加载更多
              </button>
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
