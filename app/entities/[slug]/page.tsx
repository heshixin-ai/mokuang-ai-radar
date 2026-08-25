import { notFound } from "next/navigation";
import { EventFeed } from "@/components/event-feed";
import { SiteHeader } from "@/components/site-header";
import { getEntityTimeline } from "@/lib/repository/taxonomy";

export const dynamic = "force-dynamic";
export default async function EntityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const timeline = await getEntityTimeline(slug); if (!timeline) notFound();
  return <main><SiteHeader /><header className="timeline-hero"><span className="section-label">ENTITY TIMELINE</span><h1>{timeline.label}</h1><p>{timeline.description} · 共 {timeline.count} 条</p></header><EventFeed events={timeline.events} /></main>;
}
