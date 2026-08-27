import { notFound } from "next/navigation";
import { EventFeed } from "@/components/event-feed";
import { SiteHeader } from "@/components/site-header";
import Link from "@/components/site-link";
import { getTopicTimeline } from "@/lib/repository/taxonomy";

export const dynamic = "force-dynamic";
export default async function TopicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const timeline = await getTopicTimeline(slug); if (!timeline) notFound();
  return <main className="topic-page topic-detail-page"><SiteHeader active="topics" /><section className="topic-detail-shell"><Link className="topic-back-link" href="/topics">返回全部主题</Link><header className="topic-detail-hero"><div><p className="topic-overline">持续更新的主题时间线</p><h1>{timeline.label}</h1><p>{timeline.description}</p></div><aside><strong>{timeline.count}</strong><span>条已发布事件</span></aside></header></section><EventFeed events={timeline.events} referenceTime={new Date().toISOString()} initialTimeRange="all" /></main>;
}
