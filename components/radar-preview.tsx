"use client";

import { useState } from "react";
import Link from "@/components/site-link";

export type RadarPreviewEvent = {
  id: string;
  typeLabel: string;
  title: string;
  deck: string;
};

export type RadarPreviewTopic = {
  slug: string;
  label: string;
  count: number;
};

export function RadarPreview({
  events,
  topics,
  sourceCount,
}: {
  events: RadarPreviewEvent[];
  topics: RadarPreviewTopic[];
  sourceCount: number;
}) {
  const [view, setView] = useState<"briefing" | "topics">("briefing");
  const isBriefing = view === "briefing";

  return (
    <div className="radar-preview">
      <div className="preview-topbar">
        <div><span className="preview-logo">模</span><strong>模况情报台</strong></div>
        <span>LIVE RADAR</span>
      </div>
      <div className="preview-shell">
        <aside className="preview-sidebar">
          <p>工作台</p>
          <div className="preview-tabs" role="tablist" aria-label="情报台视图">
            <button
              type="button"
              role="tab"
              aria-selected={isBriefing}
              aria-controls="preview-panel"
              onClick={() => setView("briefing")}
            >
              今日情报
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={!isBriefing}
              aria-controls="preview-panel"
              onClick={() => setView("topics")}
            >
              主题追踪
            </button>
          </div>
          <div className="preview-source-stat">
            <small>当前覆盖</small>
            <strong>{sourceCount}</strong>
            <span>个受控来源</span>
          </div>
        </aside>
        <div className="preview-main" id="preview-panel" role="tabpanel" aria-live="polite">
          <header>
            <div>
              <span>{isBriefing ? "DAILY BRIEFING" : "TOPIC TRACKING"}</span>
              <h2>{isBriefing ? "今天值得处理的变化" : "当前持续追踪的主题"}</h2>
            </div>
          </header>
          {isBriefing ? (
            <div className="preview-events">
              {events.length > 0 ? events.map((event, index) => (
                <Link className="preview-event" href={`/events/${event.id}`} key={event.id}>
                  <span className="preview-event-index">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <small>{event.typeLabel}</small>
                    <h3>{event.title}</h3>
                    <p>{event.deck}</p>
                  </div>
                  <span className="preview-arrow" aria-hidden="true">↗</span>
                </Link>
              )) : (
                <div className="preview-empty">新的正式事件正在处理中。</div>
              )}
            </div>
          ) : (
            <div className="preview-events preview-topics">
              {topics.length > 0 ? topics.map((topic, index) => (
                <Link className="preview-event preview-topic" href={`/topics/${topic.slug}`} key={topic.slug}>
                  <span className="preview-event-index">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <small>持续追踪</small>
                    <h3>{topic.label}</h3>
                    <p>已收录 {topic.count} 条正式事件，按时间查看相关变化。</p>
                  </div>
                  <span className="preview-arrow" aria-hidden="true">↗</span>
                </Link>
              )) : (
                <div className="preview-empty">首个主题将在正式事件发布后出现。</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
