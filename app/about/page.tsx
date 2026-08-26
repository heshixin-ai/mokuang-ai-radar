import { LegalPage } from "@/components/legal-page";

export default function AboutPage() { return <LegalPage activeNav="about" eyebrow="ABOUT MOKUANG" title="关于模况" intro="模况是一套面向中文 AI 产品经理、开发者和小团队的变化情报系统。"><h2>关注变化，而非文章</h2><p>系统从受控官方来源、研究机构和可信媒体发现内容，先抽取候选，再做跨来源聚类、影响分析和自动发布门禁；未满足条件的内容不会进入公开页面。</p><h2>证据如何呈现</h2><p>每条正式事件保留来源、字段级引用、证据等级、模型与 Prompt 版本。相似内容不会自动合并，质量门禁不会被模型自行绕过。</p><h2>当前阶段</h2><p>这是可运行 MVP。来源连续成功率需在部署后真实观测满 7 天；120 条上线回归是合成契约测试，不代表人工金标准确率。</p></LegalPage>; }
