"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { EventAdminDashboard, EventAdminView } from "@/lib/events/types";
import type { ClusterDashboard, ClusterDecisionView } from "@/lib/clustering/types";
import type { CandidateView, DashboardData, ReviewStatus } from "@/lib/ingestion/types";

type BusyAction = { kind: "source" | "document" | "candidate" | "cluster" | "draft" | "event"; id: string } | null;
type ApiEnvelope<T> = { data: T; error?: never } | { data?: never; error: { message: string } };

const statusLabels: Record<ReviewStatus, string> = {
  pending: "待审核",
  approved: "已批准",
  rejected: "已驳回",
};

const eventTypeLabels: Record<string, string> = {
  model_release: "模型发布",
  api_change: "API 变化",
  pricing: "价格变化",
  policy: "政策",
  funding: "融资",
  research: "研究",
};

export function ReviewDashboard() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [eventDashboard, setEventDashboard] = useState<EventAdminDashboard | null>(null);
  const [clusterDashboard, setClusterDashboard] = useState<ClusterDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [activeStatus, setActiveStatus] = useState<ReviewStatus>("pending");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, Record<string, string>>>({});

  const loadDashboard = useCallback(async () => {
    setError(null);
    try {
      const [reviewResponse, eventResponse, clusterResponse] = await Promise.all([
        fetch("/api/v1/admin/dashboard", { cache: "no-store" }),
        fetch("/api/v1/admin/events", { cache: "no-store" }),
        fetch("/api/v1/admin/clusters", { cache: "no-store" }),
      ]);
      const [reviewPayload, eventPayload, clusterPayload] = await Promise.all([
        readPayload<DashboardData>(reviewResponse),
        readPayload<EventAdminDashboard>(eventResponse),
        readPayload<ClusterDashboard>(clusterResponse),
      ]);
      if (!reviewResponse.ok || !reviewPayload.data) throw new Error(reviewPayload.error?.message ?? "审核数据读取失败。");
      if (!eventResponse.ok || !eventPayload.data) throw new Error(eventPayload.error?.message ?? "发布数据读取失败。");
      if (!clusterResponse.ok || !clusterPayload.data) throw new Error(clusterPayload.error?.message ?? "聚类数据读取失败。");
      setDashboard(reviewPayload.data);
      setEventDashboard(eventPayload.data);
      setClusterDashboard(clusterPayload.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "审核数据读取失败。");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadDashboard(), 0);
    return () => window.clearTimeout(timer);
  }, [loadDashboard]);

  const visibleCandidates = useMemo(
    () => dashboard?.candidates.filter((candidate) => candidate.reviewStatus === activeStatus) ?? [],
    [activeStatus, dashboard],
  );

  async function runAction(kind: NonNullable<BusyAction>["kind"], id: string, request: () => Promise<Response>) {
    setBusy({ kind, id });
    setError(null);
    setNotice(null);
    try {
      const response = await request();
      const payload = await readPayload<unknown>(response);
      if (!response.ok) throw new Error(payload.error?.message ?? "操作失败，请稍后重试。");
      setNotice(
        kind === "source" ? "采集完成，新内容已进入待分析区。"
          : kind === "document" ? "分析完成，结果已进入候选队列。"
            : kind === "candidate" ? "审核状态已保存；没有触发公开发布。"
              : kind === "cluster" ? "聚类建议已更新；合并后的事件会重新经过质量复核。"
              : kind === "draft" ? "正式事件草稿已生成；仍需通过质量门禁并单独发布。"
                : "事件发布状态已更新，并保留了审计记录。",
      );
      await loadDashboard();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作失败，请稍后重试。");
    } finally {
      setBusy(null);
    }
  }

  async function reviewCandidate(candidate: CandidateView, action: "approve" | "reject" | "reopen") {
    const note = notes[candidate.id]?.trim() || null;
    if (action === "reject" && !note) {
      setError("驳回候选时请填写原因，方便后续修正和追溯。");
      return;
    }
    await runAction("candidate", candidate.id, () => fetch(`/api/v1/admin/candidates/${candidate.id}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, note }),
    }));
  }

  async function createDraft(candidate: CandidateView) {
    await runAction("draft", candidate.id, () => fetch(`/api/v1/admin/candidates/${candidate.id}/draft`, {
      method: "POST",
    }));
  }

  async function clusterCandidate(candidate: CandidateView) {
    await runAction("cluster", candidate.id, () => fetch(`/api/v1/admin/candidates/${candidate.id}/cluster`, { method: "POST" }));
  }

  async function reviewCluster(decision: ClusterDecisionView, action: "confirm_merge" | "keep_separate") {
    await runAction("cluster", decision.id, () => fetch(`/api/v1/admin/clusters/${decision.id}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, note: notes[decision.id]?.trim() || null }),
    }));
  }

  async function transitionEvent(event: EventAdminView, action: "publish" | "withdraw") {
    const note = notes[event.id]?.trim() || null;
    if (action === "withdraw" && !note) {
      setError("撤下事件时请填写原因，方便后续追溯。");
      return;
    }
    await runAction("event", event.id, () => fetch(`/api/v1/admin/events/${event.id}/publication`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, note }),
    }));
  }

  function beginEdit(event: EventAdminView) {
    setEditingId(event.id);
    setEdits((current) => ({ ...current, [event.id]: {
      titleZh: event.titleZh, deckZh: event.deckZh, whatChanged: event.whatChanged,
      before: event.before ?? "", after: event.after ?? "", whyItMatters: event.whyItMatters,
      recommendedAction: event.recommendedAction ?? "", note: "人工复核并修订正式事件",
    } }));
  }

  async function saveEdit(event: EventAdminView) {
    const edit = edits[event.id];
    if (!edit) return;
    await runAction("event", event.id, () => fetch(`/api/v1/admin/events/${event.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...edit, before: edit.before || null, after: edit.after || null, recommendedAction: edit.recommendedAction || null }),
    }));
    setEditingId(null);
  }

  if ((!dashboard || !eventDashboard || !clusterDashboard) && !error) {
    return <div className="review-loading" role="status">正在读取来源与候选队列…</div>;
  }

  return (
    <div className="review-dashboard">
      {error && <div className="review-alert error" role="alert">{error} <button type="button" onClick={() => void loadDashboard()}>重试</button></div>}
      {notice && <div className="review-alert success" role="status">{notice}</div>}

      {dashboard && (
        <>
          <section className="review-stats" aria-label="审核概览">
            <Metric label="待分析" value={dashboard.counts.pendingAnalysis} tone="amber" />
            <Metric label="待审核" value={dashboard.counts.pendingReview} tone="red" />
            <Metric label="已批准" value={dashboard.counts.approved} tone="green" />
            <Metric label="已驳回" value={dashboard.counts.rejected} tone="muted" />
          </section>

          <section className="review-panel" aria-labelledby="sources-title">
            <div className="review-panel-heading">
              <div><span>01</span><h2 id="sources-title">受控来源</h2></div>
              <p>只访问登记过的 RSS、Release 与专用公开页面，不接受任意网址。</p>
            </div>
            <div className="source-admin-grid">
              {dashboard.sources.map((source) => (
                <article className="source-admin-card" key={source.id}>
                  <div className="source-admin-top">
                    <span className="source-health" data-healthy={source.consecutiveFailures === 0} />
                    <div><strong>{source.name}</strong><small>{source.authorizationStatus === "approved" ? "授权记录已确认" : "授权待确认"}</small></div>
                  </div>
                  <dl>
                    <div><dt>最近成功</dt><dd>{formatDate(source.lastSuccessAt)}</dd></div>
                    <div><dt>连续失败</dt><dd>{source.consecutiveFailures} 次</dd></div>
                    <div><dt>频率</dt><dd>{source.frequencyMinutes} 分钟</dd></div>
                  </dl>
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => void runAction("source", source.id, () => fetch("/api/v1/admin/ingestion/runs", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ sourceId: source.id }),
                    }))}
                  >
                    {busy?.kind === "source" && busy.id === source.id ? "采集中…" : "立即采集"}
                  </button>
                </article>
              ))}
            </div>
            <div className="run-history" aria-label="最近采集运行">
              <div><h3>最近运行</h3><p>定时任务每 30 分钟检查到期来源；每次均保留独立运行记录。</p></div>
              <ol>
                {dashboard.recentRuns.slice(0, 8).map((run) => (
                  <li key={run.id}>
                    <span>{run.triggerKind === "scheduled" ? "定时" : "手动"}</span>
                    <strong>{run.sourceName}</strong>
                    <time>{formatDate(run.startedAt)}</time>
                    <b data-status={run.status}>{run.status === "succeeded" ? `新增 ${run.insertedCount}` : run.status === "failed" ? `失败 · ${run.errorCode ?? "未知"}` : "运行中"}</b>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <section className="review-panel" aria-labelledby="documents-title">
            <div className="review-panel-heading">
              <div><span>02</span><h2 id="documents-title">待分析内容</h2></div>
              <p>正文只保留生成所需短摘录；每次只分析一条。</p>
            </div>
            {dashboard.pendingDocuments.length > 0 ? (
              <div className="document-queue">
                {dashboard.pendingDocuments.map((document) => (
                  <article key={document.id}>
                    <div className="queue-meta"><span>{document.sourceName}</span><time>{formatDate(document.publishedAt)}</time><b>{document.status === "analysis_failed" ? "可重试" : document.status === "analyzing" ? "处理中" : "待分析"}</b></div>
                    <h3><a href={document.canonicalUrl} target="_blank" rel="noreferrer">{document.title} ↗</a></h3>
                    <p>{document.contentExcerpt}</p>
                    {document.analysisErrorCode && <small>上次失败：{document.analysisErrorCode}</small>}
                    <button
                      type="button"
                      disabled={Boolean(busy) || document.status === "analyzing"}
                      onClick={() => void runAction("document", document.id, () => fetch(`/api/v1/admin/documents/${document.id}/analyze`, { method: "POST" }))}
                    >
                      {busy?.kind === "document" && busy.id === document.id ? "AI 分析中…" : "生成候选"}
                    </button>
                  </article>
                ))}
              </div>
            ) : <Empty text="当前没有待分析内容。先从上方运行一次采集。" />}
          </section>

          <section className="review-panel" aria-labelledby="candidates-title">
            <div className="review-panel-heading candidate-heading">
              <div><span>03</span><h2 id="candidates-title">候选审核</h2></div>
              <div className="review-tabs" aria-label="按审核状态筛选">
                {(Object.keys(statusLabels) as ReviewStatus[]).map((status) => (
                  <button type="button" key={status} aria-pressed={activeStatus === status} onClick={() => setActiveStatus(status)}>
                    {statusLabels[status]}
                  </button>
                ))}
              </div>
            </div>
            {visibleCandidates.length > 0 ? (
              <div className="candidate-queue">
                {visibleCandidates.map((candidate) => (
                  <article className="candidate-review-card" key={candidate.id}>
                    <div className="candidate-review-meta">
                      <span>{eventTypeLabels[candidate.eventType] ?? candidate.eventType}</span>
                      <span>{candidate.evidenceLevel}</span>
                      <span>置信度 {Math.round(candidate.confidence * 100)}%</span>
                      <span>{candidate.modelId}</span>
                      <span>{(candidate.latencyMs / 1000).toFixed(1)} 秒 · {candidate.usage.totalTokens} Tokens</span>
                    </div>
                    <h3>{candidate.titleZh}</h3>
                    <p>{candidate.whatChanged}</p>
                    <div className="candidate-source"><a href={candidate.canonicalUrl} target="_blank" rel="noreferrer">{candidate.sourceName} · {candidate.sourceTitle} ↗</a></div>
                    {candidate.reviewReasons.length > 0 && <ul>{candidate.reviewReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
                    {candidate.reviewStatus === "pending" ? (
                      <div className="review-controls">
                        <label>
                          审核备注（驳回时必填）
                          <textarea value={notes[candidate.id] ?? ""} maxLength={1000} onChange={(event) => setNotes((current) => ({ ...current, [candidate.id]: event.target.value }))} />
                        </label>
                        <div>
                          <button className="reject-button" type="button" disabled={Boolean(busy)} onClick={() => void reviewCandidate(candidate, "reject")}>驳回</button>
                          <button className="approve-button" type="button" disabled={Boolean(busy)} onClick={() => void reviewCandidate(candidate, "approve")}>批准进入下一阶段</button>
                        </div>
                      </div>
                    ) : (
                      <div className="review-decision">
                        <div><strong>{statusLabels[candidate.reviewStatus]}</strong><span>{candidate.reviewedBy ?? "—"} · {formatDate(candidate.reviewedAt)}</span>{candidate.reviewNote && <p>{candidate.reviewNote}</p>}</div>
                        <div className="review-decision-actions">
                          {candidate.reviewStatus === "approved" && !eventDashboard?.events.some((event) => event.candidateId === candidate.id) && !clusterDashboard?.decisions.some((decision) => decision.candidateId === candidate.id) && (
                            <button className="approve-button" type="button" disabled={Boolean(busy)} onClick={() => void clusterCandidate(candidate)}>检查重复事件</button>
                          )}
                          {candidate.reviewStatus === "approved" && !eventDashboard?.events.some((event) => event.candidateId === candidate.id) && clusterDashboard?.decisions.some((decision) => decision.candidateId === candidate.id && decision.action === "create_new" && decision.status !== "proposed") && (
                            <button className="approve-button" type="button" disabled={Boolean(busy)} onClick={() => void createDraft(candidate)}>{busy?.kind === "draft" && busy.id === candidate.id ? "生成中…" : "生成正式草稿"}</button>
                          )}
                          {clusterDashboard?.decisions.some((decision) => decision.candidateId === candidate.id && decision.status === "proposed") && <span>等待处理合并建议</span>}
                          {candidate.reviewStatus === "approved" && eventDashboard?.events.some((event) => event.candidateId === candidate.id) && <span>已生成正式草稿</span>}
                          <button type="button" disabled={Boolean(busy)} onClick={() => void reviewCandidate(candidate, "reopen")}>重新打开</button>
                        </div>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            ) : <Empty text={`当前没有${statusLabels[activeStatus]}候选。`} />}
          </section>

          {clusterDashboard && (
            <section className="review-panel" aria-labelledby="clusters-title">
              <div className="review-panel-heading">
                <div><span>04</span><h2 id="clusters-title">跨来源聚类</h2></div>
                <p>规则只提出建议；相似候选必须由审核员确认合并或保留为独立事件。</p>
              </div>
              <div className="publication-stats">
                <Metric label="待判断" value={clusterDashboard.counts.proposed} tone="red" />
                <Metric label="已合并" value={clusterDashboard.counts.merged} tone="green" />
                <Metric label="独立事件" value={clusterDashboard.counts.separate} tone="muted" />
              </div>
              {clusterDashboard.decisions.filter((decision) => decision.status === "proposed").length > 0 ? (
                <div className="candidate-queue">
                  {clusterDashboard.decisions.filter((decision) => decision.status === "proposed").map((decision) => (
                    <article className="candidate-review-card" key={decision.id}>
                      <div className="candidate-review-meta"><span>{decision.action === "merge_suggested" ? "建议合并" : "需要判断"}</span><span>相似度 {Math.round(decision.similarity * 100)}%</span></div>
                      <h3>{decision.candidateTitle}</h3>
                      <p>可能属于：{decision.targetEventTitle ?? "未知事件"}</p>
                      <ul>{decision.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
                      <div className="review-controls">
                        <label>判断备注<textarea value={notes[decision.id] ?? ""} maxLength={1000} onChange={(change) => setNotes((current) => ({ ...current, [decision.id]: change.target.value }))} /></label>
                        <div>
                          <button type="button" disabled={Boolean(busy)} onClick={() => void reviewCluster(decision, "keep_separate")}>保留独立事件</button>
                          <button className="approve-button" type="button" disabled={Boolean(busy)} onClick={() => void reviewCluster(decision, "confirm_merge")}>确认合并来源</button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : <Empty text="当前没有需要人工判断的聚类建议。" />}
            </section>
          )}

          {eventDashboard && (
            <section className="review-panel" aria-labelledby="events-title">
              <div className="review-panel-heading">
                <div><span>05</span><h2 id="events-title">正式事件与发布门禁</h2></div>
                <p>草稿必须通过结构、引用与置信度检查；安全策略外的发布和所有撤下仍需人工操作。</p>
              </div>
              <div className="publication-stats" aria-label="发布概览">
                <Metric label="草稿" value={eventDashboard.counts.draft} tone="amber" />
                <Metric label="可发布" value={eventDashboard.counts.ready} tone="green" />
                <Metric label="已发布" value={eventDashboard.counts.published} tone="green" />
                <Metric label="已撤下" value={eventDashboard.counts.withdrawn} tone="muted" />
              </div>
              {eventDashboard.events.length > 0 ? (
                <div className="publication-queue">
                  {eventDashboard.events.map((event) => (
                    <article className="publication-card" key={event.id}>
                      <div className="candidate-review-meta">
                        <span>{eventTypeLabels[event.eventType] ?? event.eventType}</span>
                        <span>{event.status === "draft" ? "草稿" : event.status === "published" ? "已发布" : "已撤下"}</span>
                        <span className={event.qualityStatus === "ready" ? "quality-ready" : "quality-blocked"}>
                          {event.qualityStatus === "ready" ? "门禁通过" : "门禁阻断"}
                        </span>
                        <span>置信度 {Math.round(event.confidence * 100)}%</span>
                        <span>{event.modelId}</span>
                      </div>
                      <h3>{event.titleZh}</h3>
                      <p>{event.deckZh}</p>
                      {editingId === event.id ? (
                        <div className="event-editor">
                          {(["titleZh", "deckZh", "whatChanged", "before", "after", "whyItMatters", "recommendedAction", "note"] as const).map((field) => (
                            <label key={field}>{editLabels[field]}
                              {field === "titleZh" ? <input value={edits[event.id]?.[field] ?? ""} onChange={(change) => setEdits((current) => ({ ...current, [event.id]: { ...current[event.id], [field]: change.target.value } }))} />
                                : <textarea value={edits[event.id]?.[field] ?? ""} onChange={(change) => setEdits((current) => ({ ...current, [event.id]: { ...current[event.id], [field]: change.target.value } }))} />}
                            </label>
                          ))}
                          <div><button type="button" onClick={() => setEditingId(null)}>取消</button><button className="approve-button" type="button" disabled={Boolean(busy)} onClick={() => void saveEdit(event)}>保存为新修订版</button></div>
                        </div>
                      ) : event.status !== "published" && <button className="edit-event-button" type="button" disabled={Boolean(busy)} onClick={() => beginEdit(event)}>编辑并复核</button>}
                      <div className="draft-content-grid">
                        <div><span>为什么重要</span><p>{event.whyItMatters}</p></div>
                        <div><span>建议行动</span><p>{event.recommendedAction ?? "暂无建议行动。"}</p></div>
                      </div>
                      {event.qualityIssues.length > 0 && (
                        <div className="quality-issues"><strong>阻断原因</strong><ul>{event.qualityIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>
                      )}
                      <div className="publication-source">
                        {event.sources.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer">{source.publisher} · {source.title} ↗</a>)}
                      </div>
                      <div className="publication-actions">
                        {event.status === "published" ? (
                          <>
                            <a href={`/events/${event.id}`} target="_blank" rel="noreferrer">查看公开详情 ↗</a>
                            <label>撤下原因<textarea value={notes[event.id] ?? ""} maxLength={1000} onChange={(change) => setNotes((current) => ({ ...current, [event.id]: change.target.value }))} /></label>
                            <button className="reject-button" type="button" disabled={Boolean(busy)} onClick={() => void transitionEvent(event, "withdraw")}>撤下事件</button>
                          </>
                        ) : (
                          <button className="approve-button" type="button" disabled={Boolean(busy) || event.qualityStatus !== "ready"} onClick={() => void transitionEvent(event, "publish")}>
                            {event.qualityStatus === "ready" ? "人工确认并发布" : "未通过门禁，不能发布"}
                          </button>
                        )}
                      </div>
                      {event.revisions.length > 0 && <details className="revision-history"><summary>修订记录（{event.revisions.length}）</summary><ol>{event.revisions.map((revision) => <li key={revision.id}><strong>v{revision.revisionNumber}</strong> {revision.note}<small>{revision.actorEmail} · {formatDate(revision.createdAt)}</small></li>)}</ol></details>}
                    </article>
                  ))}
                </div>
              ) : <Empty text="尚无正式事件草稿。请先在已批准候选中生成草稿。" />}
            </section>
          )}
        </>
      )}
    </div>
  );
}

const editLabels = {
  titleZh: "中文标题", deckZh: "一句话摘要", whatChanged: "发生了什么", before: "变化前",
  after: "变化后", whyItMatters: "为什么重要", recommendedAction: "建议行动", note: "修订说明",
};

function Metric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className={`review-metric ${tone}`}><strong>{value}</strong><span>{label}</span></div>;
}

function Empty({ text }: { text: string }) {
  return <div className="review-empty">{text}</div>;
}

function formatDate(value: string | null): string {
  if (!value) return "尚无记录";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

async function readPayload<T>(response: Response): Promise<ApiEnvelope<T>> {
  try {
    return await response.json() as ApiEnvelope<T>;
  } catch {
    return { error: { message: "服务返回了无法识别的响应。" } };
  }
}
