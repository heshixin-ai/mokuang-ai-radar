import { SiteHeader } from "@/components/site-header";
import { TimelineIndex } from "@/components/timeline-index";
import { listTopicTimelines } from "@/lib/repository/taxonomy";

export const dynamic = "force-dynamic";
export default async function TopicsPage() {
  const items = await listTopicTimelines();
  return <main><SiteHeader active="topics" /><TimelineIndex title="主题时间线" eyebrow="TOPIC TIMELINES" description="按变化类型连续查看已核验、已发布的 AI 事件。" basePath="/topics" items={items} /></main>;
}
