import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { requireReviewPageActor } from "@/lib/auth/review";
import { getOperationsDashboard } from "@/lib/repository/operations";

export const dynamic = "force-dynamic";
export const metadata = { title: "运行与质量监控｜模况", robots: { index: false, follow: false } };

export default async function OperationsPage() {
  await requireReviewPageActor(); const dashboard = await getOperationsDashboard();
  return <main><SiteHeader /><section className="operations-shell"><Link href="/review">← 返回审核后台</Link><span className="section-label">LAUNCH READINESS</span><h1>运行与质量监控</h1><div className="operations-metrics"><article><strong>{dashboard.quality.passed}/{dashboard.quality.cases}</strong><span>确定性回归通过</span></article><article><strong>{dashboard.observation.observedDays}/7</strong><span>来源观测天数</span></article><article><strong>{dashboard.email.activeSubscribers}</strong><span>有效订阅者</span></article><article><strong>{dashboard.alerts.length}</strong><span>当前告警</span></article></div><p className="quality-disclaimer">120 条为合成契约回归，不是人工金标或线上准确率。连续来源成功率只有观测满 7 天后才标记完成。</p>{dashboard.alerts.length > 0 && <section className="operations-alerts"><h2>告警</h2><ul>{dashboard.alerts.map((alert) => <li key={alert}>{alert}</li>)}</ul></section>}<section className="source-health-table"><h2>近 7 天来源运行</h2><div>{dashboard.sources.map((source) => <article key={source.id} data-alert={source.alert}><strong>{source.name}</strong><span>{source.attempts} 次运行</span><span>{source.successRate === null ? "尚无样本" : `${Math.round(source.successRate * 100)}% 成功`}</span><span>连续失败 {source.consecutiveFailures}</span></article>)}</div></section><section className="operations-alerts"><h2>邮件队列</h2><p>排队 {dashboard.email.queued} · 已发送 {dashboard.email.sent} · 失败 {dashboard.email.failed}</p></section></section></main>;
}
