import Link from "@/components/site-link";
import type { TimelineSummary } from "@/lib/repository/taxonomy";

const topicDescriptions: Record<string, string> = {
  api_change: "集中查看接口、SDK、平台能力与兼容性变化，快速判断开发和产品侧是否需要调整。",
  model_release: "连续追踪新模型、版本升级与能力边界变化，保留可核验的官方发布脉络。",
  research: "筛选可能改变产品路线和技术判断的重要研究，不让论文动态淹没在资讯流里。",
  pricing: "跟进计费方式、额度与套餐变化，识别会影响成本结构的信号。",
  policy: "汇总会影响 AI 产品设计、数据使用和上线范围的政策变化。",
  funding: "关注会改变团队资源、产品竞争与产业格局的重要融资事件。",
};

export function TimelineIndex({
  title,
  description,
  basePath,
  items,
}: {
  title: string;
  eyebrow?: string;
  description: string;
  basePath: string;
  items: TimelineSummary[];
}) {
  const totalEvents = items.reduce((sum, item) => sum + item.count, 0);

  return (
    <section className="timeline-shell topic-index-shell">
      <header className="topic-hero">
        <div className="topic-hero-copy">
          <p className="topic-overline">从单条新闻，进入连续脉络</p>
          <h1>
            {title}
            <span className="topic-inline-count" role="img" aria-label={`${items.length} 个主题`}>
              {String(items.length).padStart(2, "0")}
            </span>
          </h1>
          <p>{description} 每个主题只保留已经发布、可以回溯来源的变化。</p>
        </div>
        <aside className="topic-hero-summary" aria-label="主题数据概览">
          <div>
            <strong>{totalEvents}</strong>
            <span>条已发布事件</span>
          </div>
          <p>把同一类变化放在一起看，判断它是孤立更新，还是正在形成的趋势。</p>
        </aside>
      </header>

      {items.length > 0 ? (
        <>
          <section className="topic-grid-section" aria-labelledby="topic-grid-title">
            <header>
              <h2 id="topic-grid-title">选择一个主题</h2>
              <p>按你的工作重点进入时间线，最新事件会优先显示。</p>
            </header>
            <div className="timeline-index topic-card-grid">
              {items.map((item) => (
                <Link className="topic-card" href={`${basePath}/${item.slug}`} key={item.slug}>
                  <span className="topic-card-status"><i />持续更新</span>
                  <strong>{item.label}</strong>
                  <p>{topicDescriptions[item.slug] ?? `持续追踪${item.label}相关的重要变化，并保留原始依据。`}</p>
                  <footer>
                    <span>{item.count} 条已发布事件</span>
                    <b>进入主题</b>
                  </footer>
                </Link>
              ))}
            </div>
          </section>
        </>
      ) : (
        <div className="empty-state"><strong>尚无正式时间线</strong><p>首条匹配事件通过发布门禁后会自动出现。</p></div>
      )}

      <footer className="topic-action">
        <div>
          <strong>想先看今天发生了什么？</strong>
          <p>返回情报流，按时间和类型筛选最新变化。</p>
        </div>
        <Link href="/#events">浏览今日情报</Link>
      </footer>
    </section>
  );
}
