"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CandidateView, DashboardData, ReviewStatus } from "@/lib/ingestion/types";

type BusyAction = { kind: "source" | "document" | "candidate"; id: string } | null;
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
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [activeStatus, setActiveStatus] = useState<ReviewStatus>("pending");
  const [notes, setNotes] = useState<Record<string, string>>({});

  const loadDashboard = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/v1/admin/dashboard", { cache: "no-store" });
      const payload = await readPayload<DashboardData>(response);
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "审核数据读取失败。");
      setDashboard(payload.data);
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

  async function runAction(kind: "source" | "document" | "candidate", id: string, request: () => Promise<Response>) {
    setBusy({ kind, id });
    setError(null);
    setNotice(null);
    try {
      const response = await request();
      const payload = await readPayload<unknown>(response);
      if (!response.ok) throw new Error(payload.error?.message ?? "操作失败，请稍后重试。");
      setNotice(kind === "source" ? "采集完成，新内容已进入待分析区。" : kind === "document" ? "分析完成，结果已进入候选队列。" : "审核状态已保存；没有触发公开发布。");
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

  if (!dashboard && !error) {
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
              <p>只访问登记过的官方 RSS，不接受任意网址。</p>
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
                        <button type="button" disabled={Boolean(busy)} onClick={() => void reviewCandidate(candidate, "reopen")}>重新打开</button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            ) : <Empty text={`当前没有${statusLabels[activeStatus]}候选。`} />}
          </section>
        </>
      )}
    </div>
  );
}

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
