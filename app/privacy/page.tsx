import { FeedbackForm } from "@/components/feedback-form";
import { LegalPage } from "@/components/legal-page";

export default function PrivacyPage() { return <LegalPage eyebrow="PRIVACY" title="隐私说明" intro="我们只收集提供服务和处理请求所需的最少数据。"><h2>收集什么</h2><p>订阅时收集邮箱、主题偏好、同意与确认时间、发送和退订状态；纠错或隐私请求会保存你主动填写的邮箱与说明。审核后台身份由托管平台提供，仅对授权审核员开放。</p><h2>为什么使用</h2><p>这些数据用于发送你选择的日报、防止重复或未经确认的邮件、处理退订与纠错，以及保障系统安全和审计。我们不出售订阅者信息。</p><h2>第三方与跨境</h2><p>生产邮件可由 Resend 代发；其会处理收件地址和邮件内容。来源链接会带你离开本站，适用对应网站的隐私规则。</p><h2>保留与权利</h2><p>有效订阅数据保留至退订或删除请求处理完成。退订记录可为抑制误发和审计保留；你可以请求查询、更正或删除个人信息。</p><FeedbackForm kind="privacy" /></LegalPage>; }
