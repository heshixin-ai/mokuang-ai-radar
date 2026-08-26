import { notFound } from "next/navigation";
import { EventFeed } from "@/components/event-feed";
import { SiteHeader } from "@/components/site-header";
import { getTopicTimeline } from "@/lib/repository/taxonomy";

export const dynamic = "force-dynamic";
export default async function TopicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const timeline = await getTopicTimeline(slug); if (!timeline) notFound();
  return <main><SiteHeader active="topics" /><header className="timeline-hero"><span className="section-label">TOPIC TIMELINE</span><h1>{timeline.label}</h1><p>{timeline.description} · 共 {timeline.count} 条</p></header><EventFeed events={timeline.events} /></main>;
}
