import { SiteHeader } from "@/components/site-header";
import { SubscriptionForm } from "@/components/subscription-form";

export default async function SubscribePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  return <main><SiteHeader /><section className="subscribe-shell"><span className="section-label">DAILY DIGEST</span><h1>每天一封，<br />只看值得处理的变化。</h1><p>日报只包含你选择的主题和已人工发布事件。订阅采用双重确认，不会把待审核候选发到邮箱。</p>{query.verified === "1" && <div className="subscribe-notice">邮箱已确认，下一期有匹配事件时会收到日报。</div>}{query.verified === "0" && <div className="subscribe-notice error">确认链接无效或已经使用。</div>}{query.unsubscribed === "1" && <div className="subscribe-notice">已退订，不会再发送日报。</div>}<SubscriptionForm /></section></main>;
}
