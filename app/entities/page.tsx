import { SiteHeader } from "@/components/site-header";
import { TimelineIndex } from "@/components/timeline-index";
import { listEntityTimelines } from "@/lib/repository/taxonomy";

export const dynamic = "force-dynamic";
export default async function EntitiesPage() {
  const items = await listEntityTimelines();
  return <main><SiteHeader /><TimelineIndex title="实体时间线" eyebrow="ENTITY TIMELINES" description="沿着公司、模型和开源项目查看事件演进。" basePath="/entities" items={items} /></main>;
}
