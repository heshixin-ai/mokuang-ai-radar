import { FeedbackForm } from "@/components/feedback-form";
import { LegalPage } from "@/components/legal-page";

export default function CorrectionsPage() { return <LegalPage eyebrow="CORRECTIONS" title="纠错与更正" intro="如果事件标题、变化描述、时间或引用有误，请把事实与依据告诉我们。"><h2>处理方式</h2><p>请求会进入独立队列。审核员核对原始来源后，可撤下事件、保存修订版本并重新发布；历史发布和修订动作保留审计记录。</p><h2>请提供</h2><p>尽量附上事件 ID 或链接、具体错误、正确表述以及可公开核验的来源。我们不会因为观点不同而改写可核验事实。</p><FeedbackForm kind="correction" /></LegalPage>; }
