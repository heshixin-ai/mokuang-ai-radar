import { SiteHeader } from "@/components/site-header";

export function LegalPage({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: string; children: React.ReactNode }) {
  return <main><SiteHeader /><article className="legal-shell"><span className="section-label">{eyebrow}</span><h1>{title}</h1><p className="legal-intro">{intro}</p><div className="legal-content">{children}</div><small>最后更新：2026 年 8 月 25 日</small></article></main>;
}
