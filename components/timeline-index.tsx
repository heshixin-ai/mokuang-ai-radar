import Link from "@/components/site-link";
import type { TimelineSummary } from "@/lib/repository/taxonomy";

export function TimelineIndex({ title, eyebrow, description, basePath, items }: { title: string; eyebrow: string; description: string; basePath: string; items: TimelineSummary[] }) {
  return <section className="timeline-shell"><span className="section-label">{eyebrow}</span><h1>{title}</h1><p>{description}</p>{items.length > 0 ? <div className="timeline-index">{items.map((item) => <Link href={`${basePath}/${item.slug}`} key={item.slug}><strong>{item.label}</strong><span>{item.count} 条正式事件 →</span></Link>)}</div> : <div className="empty-state"><strong>尚无正式时间线</strong><p>首条匹配事件通过发布门禁后会自动出现。</p></div>}</section>;
}
